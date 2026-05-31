import fs from "fs";
import path from "path";

const DB_PATH = process.env.JSON_DB_PATH || path.join(process.cwd(), "data", "teco-db.json");

interface DbData {
  events: EconomicEvent[];
  users: User[];
  ownerContext: OwnerContext;
  interactions: any[];
  suggestions: LearningSuggestion[];
}

let _cache: DbData | null = null;

function load(): DbData {
  // Always read from disk to avoid stale cache across Next.js API routes
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
      _cache = data;
      return data;
    }
  } catch {}
  _cache = {
    events: [],
    users: [],
    ownerContext: { ...DEFAULT_OWNER_CONTEXT },
    interactions: [],
    suggestions: [],
  };
  save(_cache);
  return _cache;
}

function save(data: DbData): void {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf8");
  _cache = data;
}

// ─── Events ───

export interface EconomicEvent {
  id: string;
  workerName: string | null;
  workerPhone: string | null;
  economicLabel: string | null;
  economicKind: string | null;
  executionStatus: string | null;
  paymentStatus: string | null;
  derivedCategory: string | null;
  category: string | null;
  amount: number | null;
  currency: string;
  date: string | null;
  broadArea: string | null;
  location: string | null;
  description: string | null;
  pgOrExternalRef: string | null;
  originChannel: string | null;
  evidenceType: string | null;
  commercialStatus: string | null;
  quotedAmount: number | null;
  startDate: string | null;
  endDate: string | null;
  estimatedDuration: string | null;
  collaborators: string[];
  splitRule: string | null;
  netIncome: number | null;
  quantity: number | null;
  unit: string | null;
  grossAmount: number | null;
  costAmount: number | null;
  costDescription: string | null;
  deductionAmount: number | null;
  deductionDescription: string | null;
  sourceMessage: string;
  source: string | null;
  createdAt: string;
}

export function getAllEvents(): EconomicEvent[] {
  return load().events.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export function insertEvent(event: EconomicEvent): void {
  const db = load();
  const idx = db.events.findIndex((e) => e.id === event.id);
  if (idx >= 0) db.events[idx] = event;
  else db.events.push(event);
  save(db);
}

export function deleteEventById(id: string): boolean {
  const db = load();
  const before = db.events.length;
  db.events = db.events.filter((e) => e.id !== id);
  save(db);
  return db.events.length < before;
}

export function deleteAllEvents(): void {
  const db = load();
  db.events = [];
  save(db);
}

// ─── Users ───

export interface User {
  id: string;
  name: string | null;
  phone: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
}

export function getAllUsers(): User[] {
  return load().users.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export function upsertUser(user: User): void {
  const db = load();
  const idx = db.users.findIndex((u) => u.phone === user.phone);
  if (idx >= 0) {
    db.users[idx] = { ...db.users[idx], ...user, updatedAt: new Date().toISOString() };
  } else {
    db.users.push(user);
  }
  save(db);
}

// ─── Owner Context ───

export interface OwnerContext {
  businessContext: string;
  interpretationRules: string;
  systemPrompt: string;
  promptTemplate: string;
  updatedAt: string | null;
}

export function getOwnerContext(): OwnerContext {
  return load().ownerContext;
}

export function saveOwnerContext(ctx: OwnerContext): void {
  const db = load();
  ctx.updatedAt = new Date().toISOString();
  db.ownerContext = ctx;
  save(db);
}

export const DEFAULT_OWNER_CONTEXT: OwnerContext = {
  businessContext: "TECO ayuda a trabajadores independientes informales a registrar y cobrar sus trabajos.",
  interpretationRules: "Todo monto se interpreta en ARS salvo que se indique otra moneda.\nSi el mensaje no contiene datos económicos claros, marcar como consulta.\nSi falta el monto o la zona, agregar a missingFields.",
  systemPrompt: "Eres el motor de interpretación del MVP de TECO. Devuelves únicamente JSON válido.",
  promptTemplate: `Fecha: {{today}}
Negocio: {{businessContext}}
Reglas: {{interpretationRules}}
Trabajador: {{workerName}} | {{workerPhone}}
Historial del trabajador: {{workerHistory}}
Mensaje: """{{message}}"""

Convierte el mensaje en un evento económico de TECO. Responde SOLO con JSON válido con esta estructura:
{"normalizedEvent": {}, "missingFields": [], "clarificationMessage": "", "workerFeedback": "", "extractionConfidence": 0.0}`,
  updatedAt: null,
};

// ─── Interactions ───

export function getInteractions(): any[] {
  return load().interactions.sort((a, b) => (b.created_at || b.timestamp || "").localeCompare(a.created_at || a.timestamp || ""));
}

export function insertInteraction(ix: any): void {
  const db = load();
  db.interactions.push(ix);
  save(db);
}

// ─── Learning Suggestions ───

export interface LearningSuggestion {
  id: string;
  createdAt: string;
  status: "pending" | "approved" | "rejected";
  reason: string;
  businessContextAddition: string | null;
  interpretationRuleAddition: string | null;
  sourceMessage: string;
  workerName: string | null;
  workerPhone: string | null;
  summary?: string;
  severity?: string;
  source?: string;
}

export function getAllSuggestions(): LearningSuggestion[] {
  return load().suggestions.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export function insertSuggestion(s: LearningSuggestion): void {
  const db = load();
  db.suggestions.push(s);
  save(db);
}

export function updateSuggestionStatus(id: string, status: "approved" | "rejected"): LearningSuggestion | null {
  const db = load();
  const sug = db.suggestions.find((s) => s.id === id);
  if (!sug) return null;
  sug.status = status;
  save(db);
  return sug;
}
