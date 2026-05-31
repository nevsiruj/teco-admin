import { getOwnerContext, type EconomicEvent } from "./db";

const LLM_TIMEOUT = Number(process.env.LLM_TIMEOUT_MS || 90_000);

export interface LLMResult {
  normalizedEvent: EconomicEvent;
  missingFields: string[];
  clarificationMessage: string;
  workerFeedback: string;
  extractionConfidence: number;
}

export async function interpretMessage(
  message: string,
  workerName: string,
  workerPhone: string,
  historySummary: string = ""
): Promise<LLMResult> {
  const apiKey = process.env.MIMO_API_KEY || process.env.OPENAI_API_KEY || "";
  const baseUrl = process.env.MIMO_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.MIMO_MODEL || "gpt-4o-mini";

  if (!apiKey) return heuristicParse(message, workerName, workerPhone);

  const ctx = getOwnerContext();
  const today = new Date().toLocaleDateString("es-AR");
  const prompt = ctx.promptTemplate
    .replace("{{today}}", today)
    .replace("{{businessContext}}", ctx.businessContext)
    .replace("{{interpretationRules}}", ctx.interpretationRules)
    .replace("{{workerName}}", workerName || "—")
    .replace("{{workerPhone}}", workerPhone || "—")
    .replace("{{workerHistory}}", historySummary || "Sin historial previo.")
    .replace("{{message}}", message);

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT);
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 1000,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: ctx.systemPrompt },
            { role: "user", content: prompt },
          ],
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if ([429, 502, 503, 504, 529].includes(res.status)) {
        await sleep(350 * attempt + Math.random() * 250);
        continue;
      }

      if (!res.ok) continue;

      const data = await res.json();
      let content = data.choices?.[0]?.message?.content || "";
      content = content.replace(/[\s\S]*?<\/think>/g, "").trim();
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) continue;

      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.normalizedEvent) {
        let event = buildEvent(parsed.normalizedEvent, message);
        // Supplement with heuristic for any missing critical fields
        const heur = heuristicParse(message, workerName, workerPhone);
        if (!event.economicKind && heur.normalizedEvent.economicKind) event.economicKind = heur.normalizedEvent.economicKind;
        if (!event.paymentStatus && heur.normalizedEvent.paymentStatus) event.paymentStatus = heur.normalizedEvent.paymentStatus;
        if (!event.derivedCategory && heur.normalizedEvent.derivedCategory) event.derivedCategory = heur.normalizedEvent.derivedCategory;
        if (!event.broadArea && heur.normalizedEvent.broadArea) event.broadArea = heur.normalizedEvent.broadArea;
        if (!event.executionStatus && heur.normalizedEvent.executionStatus) event.executionStatus = heur.normalizedEvent.executionStatus;
        return {
          normalizedEvent: event,
          missingFields: parsed.missingFields || [],
          clarificationMessage: parsed.clarificationMessage || "",
          workerFeedback: parsed.workerFeedback || "",
          extractionConfidence: Math.min(1, Math.max(0, parsed.extractionConfidence || 0.5)),
        };
      }
    } catch {
      await sleep(200);
    }
  }

  return heuristicParse(message, workerName, workerPhone);
}

function normalizePaymentStatus(raw: unknown): string | null {
  if (!raw) return null;
  const s = String(raw).toLowerCase().trim();
  const map: Record<string, string> = {
    paid: "cobrado", cobrado: "cobrado", collected: "cobrado", received: "cobrado",
    pagado: "cobrado", "ya pagado": "cobrado", "ya cobrado": "cobrado",
    pending: "pendiente_cobro", pendiente: "pendiente_cobro", "pendiente de cobro": "pendiente_cobro",
    cancelled: "cancelado", cancelado: "cancelado", canceled: "cancelado",
    sent: "enviado", enviado: "enviado",
  };
  return map[s] || s;
}

function normalizeEconomicKind(raw: unknown): string | null {
  if (!raw) return null;
  const s = String(raw).toLowerCase().trim();
  const map: Record<string, string> = {
    sale: "venta", venta: "venta", sold: "venta",
    cobro: "cobro", collection: "cobro", collected: "cobro",
    servicio: "servicio", service: "servicio",
    deposito: "deposito", deposit: "deposito",
    transferencia: "transferencia", transfer: "transferencia",
    costo: "costo", cost: "costo",
    gasto: "gasto", expense: "gasto",
    pago: "pago", payment: "pago",
    producto: "producto", product: "producto",
  };
  return map[s] || s;
}

function asString(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim() ? raw : null;
}

function asNumber(raw: unknown): number | null {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function buildEvent(raw: Record<string, unknown>, sourceMessage: string): EconomicEvent {
  const locationObject = raw.location && typeof raw.location === "object" ? raw.location as Record<string, unknown> : null;
  return {
    id: asString(raw.id) || crypto.randomUUID(),
    workerName: asString(raw.workerName),
    workerPhone: asString(raw.workerPhone),
    economicLabel: asString(raw.economicLabel) || asString(raw.label),
    economicKind: normalizeEconomicKind(raw.economicKind || raw.kind),
    executionStatus: asString(raw.executionStatus),
    paymentStatus: normalizePaymentStatus(raw.paymentStatus),
    derivedCategory: asString(raw.derivedCategory) || asString(raw.category),
    category: asString(raw.category) || asString(raw.derivedCategory),
    amount: asNumber(raw.amount) || asNumber(raw.total),
    currency: asString(raw.currency) || "ARS",
    date: asString(raw.date),
    broadArea: asString(raw.broadArea) || asString(raw.area),
    evidenceType: asString(raw.evidenceType),
    commercialStatus: asString(raw.commercialStatus),
    quotedAmount: asNumber(raw.quotedAmount),
    startDate: asString(raw.startDate),
    endDate: asString(raw.endDate),
    estimatedDuration: asString(raw.estimatedDuration),
    collaborators: Array.isArray(raw.collaborators) ? raw.collaborators.map(String) : [],
    splitRule: asString(raw.splitRule),
    netIncome: asNumber(raw.netIncome),
    quantity: asNumber(raw.quantity),
    unit: asString(raw.unit),
    grossAmount: asNumber(raw.grossAmount),
    costAmount: asNumber(raw.costAmount),
    costDescription: asString(raw.costDescription),
    deductionAmount: asNumber(raw.deductionAmount),
    deductionDescription: asString(raw.deductionDescription),
    location: asString(raw.location) || asString(locationObject?.address) || asString(raw.broadArea) || asString(raw.area),
    description: asString(raw.description) || asString(raw.details) || asString(raw.detalle),
    pgOrExternalRef: asString(raw.pgOrExternalRef) || asString(raw.reference),
    originChannel: asString(raw.originChannel) || "web",
    source: asString(raw.source) || "llm",
    sourceMessage,
    createdAt: new Date().toISOString(),
  };
}

// ─── Heuristic Fallback ───

function heuristicParse(message: string, workerName: string, workerPhone: string): LLMResult {
  const lower = message.toLowerCase();
  const amount = parseAmount(message);
  const now = new Date().toISOString();

  const isService = /arregl[eé]|instal[eé]|pint[eé]|plomer[ií]a|electricidad|clase|repar[eé]|limpi[eé]|flete|corte|poda|albañiler[ií]a|servicio|service/i.test(message);
  const isProduct = /vend[ií]|compr[eé]|botella|docena|caja|kilo|litro|producto/i.test(message);
  const kind = isProduct ? "producto" : isService ? "servicio" : null;

  const isPending = /pendiente|deben|todav[ií]a no|no me pagaron|esperando/i.test(message);
  const isPaid = /cobr[eé]|pagaron|me pagaron|transferencia|efectivo|ya cobr[eé]/i.test(message) && !isPending;
  const payment = isPaid ? "cobrado" : isPending ? "pendiente_cobro" : null;

  const isQuote = /cotizaci[oó]n|presupuest[eé]|pas[eé] el precio/i.test(message);
  const execution = isQuote ? "pendiente" : "realizado";

  const missing: string[] = [];
  if (!amount) missing.push("amount");
  if (!kind) missing.push("economicKind");
  if (!payment) missing.push("paymentStatus");

  const event: EconomicEvent = {
    id: crypto.randomUUID(),
    workerName,
    workerPhone,
    economicLabel: extractLabel(message),
    economicKind: kind,
    executionStatus: execution,
    paymentStatus: payment,
    derivedCategory: detectCategory(message),
    category: detectCategory(message),
    amount,
    currency: "ARS",
    date: parseDate(message),
    broadArea: parseLocation(message),
    location: parseLocation(message),
    evidenceType: null,
    commercialStatus: null,
    quotedAmount: null,
    startDate: null,
    endDate: null,
    estimatedDuration: null,
    collaborators: [],
    splitRule: null,
    netIncome: null,
    quantity: null,
    unit: null,
    grossAmount: null,
    costAmount: null,
    costDescription: null,
    deductionAmount: null,
    deductionDescription: null,
    description: extractLabel(message),
    pgOrExternalRef: null,
    originChannel: "web",
    source: "heuristic",
    sourceMessage: message,
    createdAt: now,
  };

  return {
    normalizedEvent: event,
    missingFields: missing,
    clarificationMessage: missing.length > 0 ? `¿Podés confirmar ${missing.map(labelField).join(", ")}?` : "",
    workerFeedback: amount ? `Registrado: ${kind || "trabajo"} por $${amount.toLocaleString("es-AR")}` : "Recibí tu mensaje, necesito más datos.",
    extractionConfidence: missing.length === 0 ? 0.8 : 0.58,
  };
}

function parseAmount(text: string): number | null {
  const patterns = [
    /\$\s*([\d.,]+)/i,
    /([\d.,]+)\s*(?:pesos|ars)/i,
    /(?:cobr[eé]|vend[ií]|pagaron|cuesta|cost[oó]|total|monto)[^\d]*?\$?\s*([\d.,]+)/i,
    /([\d.,]+)\s*(?:k|lucas)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const raw = m[1].replace(/\./g, "").replace(",", ".");
      const n = parseFloat(raw);
      if (n > 0) return n;
    }
  }
  if (/(\d{2,})/.test(text)) {
    const m2 = text.match(/(\d{3,})/);
    if (m2) return parseFloat(m2[1]);
  }
  return null;
}

function parseDate(text: string): string {
  const lower = text.toLowerCase();
  const now = new Date();
  if (/hoy/.test(lower)) return now.toISOString().slice(0, 10);
  if (/ayer/.test(lower)) {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  if (/\d{4}-\d{2}-\d{2}/.test(text)) return text.match(/(\d{4}-\d{2}-\d{2})/)![1];
  return now.toISOString().slice(0, 10);
}

function parseLocation(text: string): string | null {
  const zones = ["alberdi", "general paz", "centro", "norte", "sur", "oeste", "este", "villa"];
  for (const z of zones) {
    if (text.toLowerCase().includes(z)) return z.charAt(0).toUpperCase() + z.slice(1);
  }
  return null;
}

function detectCategory(text: string): string | null {
  const cats: Record<string, RegExp> = {
    plomería: /plomer[ií]a|canilla|p[eé]rdida de agua|tuber[ií]a/i,
    electricidad: /electricidad|el[eé]ctric[oao]|cable|luz/i,
    pintura: /pintura|pint[eé]|pintando/i,
    "venta de materiales": /vend[ií].*material|material.*vend[ií]/i,
    construcción: /construcci[oó]n|albañiler[ií]a|obra/i,
    flete: /flete|mudanza|transporte/i,
    clase: /clase|enseñ[oó]|tutor[ií]a/i,
  };
  for (const [cat, re] of Object.entries(cats)) {
    if (re.test(text)) return cat;
  }
  return null;
}

function extractLabel(text: string): string {
  const first = text.split(/[.,!?\n]/)[0].trim();
  return first.length > 60 ? first.slice(0, 57) + "..." : first;
}

function labelField(field: string): string {
  const map: Record<string, string> = {
    amount: "el monto",
    economicKind: "si es servicio o producto",
    paymentStatus: "el estado de cobro",
    date: "la fecha",
    broadArea: "la zona",
    derivedCategory: "la categoría",
  };
  return map[field] || field;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
