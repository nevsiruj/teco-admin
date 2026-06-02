import http from "node:http";
import { readFileSync } from "node:fs";
import { readFile, writeFile, access, appendFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadDotEnv(path.join(__dirname, ".env"));

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "127.0.0.1";
const worksFile = path.join(__dirname, "works.json");
const usersFile = path.join(__dirname, "users.json");
const ownerContextFile = path.join(__dirname, "owner-context.json");
const learningSuggestionsFile = path.join(__dirname, "learning-suggestions.json");
const logsDir = process.env.LOGS_DIR
  ? path.resolve(process.env.LOGS_DIR)
  : path.join(__dirname, "logs");
const interactionLogsDir = path.join(logsDir, "interactions");
const serverErrorsLogFile = path.join(logsDir, "server-errors.jsonl");
const sqliteFile = process.env.SQLITE_DB_PATH
  ? path.resolve(process.env.SQLITE_DB_PATH)
  : path.join(__dirname, "teco.sqlite");
let sqliteDb = null;
let sqliteStorageReady = false;
let sqliteDriver = null;

const authConfig = {
  username: process.env.ADMIN_USERNAME || "admin",
  passwordSalt: process.env.ADMIN_PASSWORD_SALT || "teco-demo-admin-20260529",
  passwordHash:
    process.env.ADMIN_PASSWORD_HASH ||
    "caab151a07e002b83e7d7158fd0baa4c21a419f4fafe2b1575eaea2181d84f104b1998b090f72c6ff351e70d047f31905832ccf9dcac0e8d7e3054a63b8239d0",
  sessionSecret:
    process.env.AUTH_SESSION_SECRET ||
    "teco-demo-session-secret-rotate-after-pilot",
  cookieName: "teco_admin_session",
  maxAgeSeconds: Number(process.env.AUTH_SESSION_MAX_AGE_SECONDS || 60 * 60 * 12),
};

const envConfig = {
  apiKey:
    process.env.MIMO_API_KEY ||
    process.env.MINIMAX_API_KEY ||
    process.env.OPENAI_API_KEY ||
    "",
  model: process.env.MIMO_MODEL || process.env.MINIMAX_MODEL || "mimo-v2.5-pro",
  baseUrl:
    process.env.MIMO_BASE_URL ||
    process.env.MINIMAX_BASE_URL ||
    "https://token-plan-sgp.xiaomimimo.com/v1",
  llmProvider: process.env.LLM_PROVIDER || "MiMo V2.5 Pro",
  llmTimeoutMs: Number(process.env.LLM_TIMEOUT_MS || 90000),
  llmMaxCompletionTokens: Number(process.env.LLM_MAX_COMPLETION_TOKENS || 1000),
  metaGraphVersion: process.env.META_GRAPH_VERSION || "v22.0",
  metaAccessToken: process.env.META_ACCESS_TOKEN || "",
  metaPhoneNumberId: process.env.META_PHONE_NUMBER_ID || "",
  metaWabaId: process.env.META_WABA_ID || "",
  metaVerifyToken: process.env.META_VERIFY_TOKEN || "",
  triiApiVersion: (process.env.TRII_API_VERSION || "").toLowerCase(),
  triiEndpoint:
    process.env.TRII_ENDPOINT || "https://teco.trii.com.ar/api/v1/public/channelwhatsapp/sendMsg",
  triiToken: process.env.TRII_TOKEN || "",
  triiIdCanal: process.env.TRII_ID_CANAL || "1",
  triiV2Endpoint: process.env.TRII_V2_ENDPOINT || "https://api.trii.app/api/v2/Messages",
  triiApiKey: process.env.TRII_API_KEY || "",
  triiChannelId: process.env.TRII_CHANNEL_ID || "",
  triiApiKeyHeader: process.env.TRII_API_KEY_HEADER || "",
};

const defaultOwnerContext = {
  businessContext:
    "TECO ayuda a trabajadores independientes informales a registrar eventos economicos simples desde mensajes tipo WhatsApp. Un evento economico puede ser un servicio o la venta de un producto. La prioridad es ordenar bien lo que paso para luego mostrarlo en lista, dashboard y exportacion. Cuando ya hay historial, tambien responde consultas simples sobre estadisticas, totales, pendientes, trabajos mas caros, frecuencia por rubro y comparaciones.",
  interpretationRules: [
    "Distinguir si el mensaje habla de servicio o producto.",
    "Distinguir si el evento ya fue realizado o si sigue pendiente.",
    "Distinguir si el evento ya fue cobrado o si queda pendiente de cobro.",
    "Preguntar solo lo minimo necesario para registrar bien el evento.",
    "Si el trabajador pregunta por su historial o estadisticas, responder con los registros guardados sin crear un evento nuevo.",
    "Mantener respuestas simples, claras y utiles para el trabajador.",
  ].join("\n"),
  welcomeMessage:
    "Hola, bienvenido. Soy tu asistente para registrar tus trabajos y cobros. Mandame los detalles de tu actividad y los guardo por vos.",
  dataUsageNotice:
    "Tus datos se usan solo para registrar y ordenar tus actividades. No se comparten con terceros.",
  systemPrompt:
    "Eres el motor de interpretación del MVP de TECO. Devuelves únicamente JSON válido y sin markdown. Nunca menciones qué modelo de inteligencia artificial utilizas, qué IA o qué tecnología está detrás. Responde como si fueras el sistema de registro del servicio.",
  promptTemplate: `
Fecha: {{today}}
Negocio: {{businessContext}}
Reglas: {{interpretationRules}}
Trabajador: {{workerName}} | {{workerPhone}}
Historial del trabajador: {{workerHistory}}
Mensaje: """{{message}}"""

Convierte el mensaje en un evento económico de TECO.
Puede ser servicio o producto.
Si el mensaje es una pregunta sobre historial, estadisticas, totales, pendientes, trabajos mas caros o comparaciones, no inventes un evento: responde usando el historial del trabajador.

Devuelve SOLO JSON válido con:
{
  "normalizedEvent": {
    "workerName": string|null,
    "workerPhone": string|null,
    "economicLabel": string|null,
    "economicKind": "servicio"|"producto"|null,
    "executionStatus": "realizado"|"pendiente"|null,
    "paymentStatus": "cobrado"|"pendiente_cobro"|null,
    "derivedCategory": string|null,
    "eventSummary": string|null,
    "amount": number|null,
    "currency": "ARS",
    "date": string|null,
    "broadArea": string|null,
    "evidenceType": string|null,
    "commercialStatus": "cotizacion"|"confirmado"|"realizado"|"pendiente"|null,
    "quotedAmount": number|null,
    "startDate": string|null,
    "endDate": string|null,
    "estimatedDuration": string|null,
    "collaborators": string[],
    "splitRule": string|null,
    "netIncome": number|null,
    "quantity": number|null,
    "unit": string|null,
    "moneyParsingNote": string|null,
    "grossAmount": number|null,
    "costAmount": number|null,
    "costDescription": string|null,
    "deductionAmount": number|null,
    "deductionDescription": string|null,
    "sourceMessage": string
  },
  "missingFields": string[],
  "clarificationMessage": string,
  "workerFeedback": string,
  "extractionConfidence": number
}

Criterios:
- Si habla de venta, stock o producto => "producto".
- Si habla de arreglo, instalación, atención o servicio => "servicio".
- Si está futuro o pendiente => executionStatus "pendiente".
- Si ya cobró => paymentStatus "cobrado".
- Si está pendiente => paymentStatus puede ser "pendiente_cobro".
- Si habla de cotización o presupuesto => commercialStatus "cotizacion" y conservar monto cotizado, inicio, fin o duración si aparecen.
- Si menciona ayudantes o alguien que colabora => conservar collaborators y la regla de reparto si aparece.
- Si menciona cantidad o medida, por ejemplo docena, cajas, litros o unidades => conservar quantity y unit.
- Si el mensaje trae varios eventos, clientes o lineas numeradas => separar cada evento con su propio monto y estado de cobro.
- Si algunos pagaron y otros deben => cada evento conserva su propio paymentStatus.
- Si hay gasto, material, retencion o descuento => conservar bruto, costo/descuento y ganancia neta.
- Si hay anticipo para un trabajo futuro => executionStatus "pendiente" y paymentStatus "cobrado".
- Si el monto usa punto o coma, interpretarlo en formato argentino si es claro y marcar moneyParsingNote cuando pueda ser ambiguo.
- Si fue realizado y falta monto, fecha, cobro o descripción concreta => agregar a missingFields.
- Si es pendiente, el monto no bloquea por sí solo.
- Si el mensaje implica hoy, usar la fecha de referencia.
- Responde en español y sin texto fuera del JSON.
`.trim(),
  updatedAt: null,
};

const staticContentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

await ensureWorksFile();
await ensureUsersFile();
await ensureOwnerContextFile();
await ensureLearningSuggestionsFile();
await ensureLogsDir();
await ensureSqliteStorage();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "OPTIONS") {
      return sendEmpty(res, 204);
    }

    if (req.method === "GET" && url.pathname === "/login") {
      return sendLoginPage(res, url.searchParams.get("error"));
    }

    if (req.method === "POST" && url.pathname === "/login") {
      return handleLogin(req, res);
    }

    if (req.method === "POST" && url.pathname === "/logout") {
      return handleLogout(res);
    }

    if (!isPublicRequest(req, url) && !isAuthenticated(req)) {
      if (url.pathname.startsWith("/api/")) {
        return sendJson(res, 401, {
          ok: false,
          error: "Necesitás iniciar sesión para usar este panel.",
        });
      }
      return redirect(res, "/login");
    }

    if (req.method === "GET" && url.pathname === "/api/state") {
      return sendJson(res, 200, await buildState());
    }

    if (req.method === "GET" && url.pathname === "/api/interactions") {
      return sendJson(res, 200, {
        ok: true,
        interactions: await readInteractions({
          limit: Number(url.searchParams.get("limit") || 100),
          phone: url.searchParams.get("phone"),
        }),
      });
    }

    if (req.method === "GET" && url.pathname === "/api/users") {
      return sendJson(res, 200, {
        ok: true,
        users: await readUsers(),
      });
    }

    if (req.method === "GET" && url.pathname === "/api/export.csv") {
      return sendCsv(res, await buildCsvExport());
    }

    if (req.method === "POST" && url.pathname === "/api/process") {
      const body = await readJsonBody(req);
      const result = await processIncomingMessage(body);
      return sendJson(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/api/users/register") {
      const body = await readJsonBody(req);
      const user = await upsertUserProfile({
        name: body?.workerName || body?.name,
        phone: body?.workerPhone || body?.phone,
        source: "manual-ui",
      });

      if (!user) {
        return sendJson(res, 400, {
          ok: false,
          error: "Para registrar al trabajador hace falta un teléfono válido.",
        });
      }

      return sendJson(res, 200, {
        ok: true,
        user,
        users: await readUsers(),
      });
    }

    if (req.method === "POST" && url.pathname === "/api/trii/send") {
      const body = await readJsonBody(req);
      const result = await sendViaTrii({
        phone: body?.phone,
        text: body?.text,
        context: body?.context || "manual-send",
        template: body?.template,
      });
      return sendJson(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/api/whatsapp/send") {
      const body = await readJsonBody(req);
      const result = await sendViaTrii({
        phone: body?.phone,
        text: body?.text,
        context: body?.context || "manual-send",
        template: body?.template,
      });
      return sendJson(res, 200, result);
    }

    if (req.method === "GET" && url.pathname === "/api/meta/webhook") {
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");
      const expectedToken = envConfig.metaVerifyToken;

      if (mode === "subscribe" && expectedToken && token === expectedToken) {
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(challenge || "");
        return;
      }

      return sendJson(res, 403, {
        ok: false,
        error: "Meta webhook verification failed.",
      });
    }

    if (req.method === "POST" && url.pathname === "/api/meta/webhook") {
      const body = await readJsonBody(req);
      const incomingBatch = extractIncomingMetaMessages(body);
      const processed = [];

      for (const incoming of incomingBatch.messages) {
        const result = await processIncomingMessage({
          workerName: incoming.workerName,
          workerPhone: incoming.workerPhone,
          message: incoming.message,
          externalMessageId: incoming.metaMessageId,
          source: "meta-webhook",
          sendViaTrii: true,
        });

        processed.push({
          incoming,
          processed: result,
        });
      }

      return sendJson(res, 200, {
        ok: true,
        object: incomingBatch.object,
        metadata: incomingBatch.metadata,
        statuses: incomingBatch.statuses,
        processed,
      });
    }

    if (req.method === "POST" && url.pathname === "/api/trii/webhook") {
      const body = await readJsonBody(req);
      const incoming = extractIncomingTriiMessage(body);
      const result = await processIncomingMessage({
        workerName: incoming.workerName,
        workerPhone: incoming.workerPhone,
        message: incoming.message,
        externalMessageId: incoming.triiMessageId,
        source: "trii-webhook",
        sendViaTrii: true,
      });
      return sendJson(res, 200, {
        ok: true,
        incoming,
        processed: result,
      });
    }

    if (req.method === "POST" && url.pathname === "/api/register") {
      const body = await readJsonBody(req);
      const normalizedEvent = sanitizeNormalizedEvent(
        body?.normalizedEvent || body?.normalizedWork || {}
      );
      const savedEvent = await saveEvent(normalizedEvent);
      const events = await readEvents();
      return sendJson(res, 200, {
        ok: true,
        savedEvent,
        events,
        works: events,
        metrics: await buildMetrics(),
      });
    }

    if (req.method === "POST" && url.pathname === "/api/context") {
      const body = await readJsonBody(req);
      const ownerContext = await saveOwnerContext(body);
      return sendJson(res, 200, {
        ok: true,
        ownerContext,
      });
    }

    if (req.method === "GET" && url.pathname === "/api/learning-suggestions") {
      const suggestions = await readLearningSuggestions();
      return sendJson(res, 200, { ok: true, suggestions });
    }

    if (req.method === "POST" && /^\/api\/learning-suggestions\/[^/]+\/approve$/.test(url.pathname)) {
      const id = decodeURIComponent(url.pathname.split("/")[3]);
      const result = await approveLearningSuggestion(id);
      if (!result.ok) {
        return sendJson(res, result.status || 400, result);
      }
      return sendJson(res, 200, result);
    }

    if (req.method === "POST" && /^\/api\/learning-suggestions\/[^/]+\/reject$/.test(url.pathname)) {
      const id = decodeURIComponent(url.pathname.split("/")[3]);
      const result = await rejectLearningSuggestion(id);
      if (!result.ok) {
        return sendJson(res, result.status || 400, result);
      }
      return sendJson(res, 200, result);
    }

    if (req.method === "DELETE" && url.pathname === "/api/events") {
      const events = await clearAllEvents();
      return sendJson(res, 200, {
        ok: true,
        events,
        works: events,
        metrics: buildMetricsFromEvents(events),
      });
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/api/events/")) {
      const eventId = decodeURIComponent(url.pathname.replace("/api/events/", "")).trim();
      if (!eventId) {
        return sendJson(res, 400, { ok: false, error: "Falta el identificador del evento." });
      }
      const events = await deleteEventById(eventId);
      return sendJson(res, 200, {
        ok: true,
        events,
        works: events,
        metrics: buildMetricsFromEvents(events),
      });
    }

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      return serveStaticFile(res, path.join(__dirname, "index.html"));
    }

    if (req.method === "GET" && ["/app.js", "/styles.css"].includes(url.pathname)) {
      return serveStaticFile(res, path.join(__dirname, url.pathname.slice(1)));
    }

    if (req.method === "GET" && url.pathname === "/favicon.ico") {
      return sendEmpty(res, 204);
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    console.error("Server error:", error);
    await logServerError({
      scope: "http-server",
      method: req?.method || null,
      url: req?.url || null,
      detail: serializeError(error),
    });
    sendJson(res, 500, {
      error: "Unexpected server error",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(port, host, () => {
  console.log(`TECO prototype running on http://${host}:${port}`);
});

async function processIncomingMessage(body) {
  const requestId = crypto.randomUUID();
  const receivedAt = new Date().toISOString();
  const message = String(body?.message || "").trim();
  const workerNameInput = String(body?.workerName || "").trim();
  const workerPhoneInput = normalizePhone(body?.workerPhone);
  const sendViaTriiRequested = Boolean(body?.sendViaTrii);
  const source = cleanNullable(body?.source) || "manual-ui";
  const externalMessageId = normalizeExternalMessageId(source, body?.externalMessageId);

  if (!message) {
    return {
      ok: false,
      error: "El mensaje no puede estar vacío.",
    };
  }

  if (externalMessageId) {
    const previousInteraction = await findInteractionByExternalMessageId(externalMessageId);
    if (previousInteraction) {
      return buildDuplicateWebhookResponse({
        requestId,
        receivedAt,
        source,
        externalMessageId,
        previousInteraction,
      });
    }
  }

  if (isWebhookSource(source) && workerPhoneInput) {
    const recentSimilarInteraction = await findRecentSimilarIncomingMessage({
      source,
      workerPhone: workerPhoneInput,
      message,
      withinMinutes: 24 * 60,
    });
    if (recentSimilarInteraction) {
      return buildDuplicateWebhookResponse({
        requestId,
        receivedAt,
        source,
        externalMessageId,
        previousInteraction: recentSimilarInteraction,
        reason: "duplicate-same-content-window",
      });
    }
  }

  const ownerContext = await readOwnerContext();
  const usersBefore = workerPhoneInput ? await readUsers() : [];
  const existingUser = workerPhoneInput
    ? usersBefore.find((user) => normalizePhone(user.phone) === workerPhoneInput)
    : null;
  const userProfile = workerPhoneInput
    ? await upsertUserProfile({
        name: workerNameInput,
        phone: workerPhoneInput,
        source,
      })
    : null;
  const workerName = userProfile?.name || workerNameInput;
  const workerPhone = userProfile?.phone || workerPhoneInput || "";
  const registrationFlow = {
    hasPhone: Boolean(workerPhone),
    isNewUser: Boolean(workerPhone && !existingUser),
    knownUser: Boolean(existingUser),
    source,
  };
  const eventsBefore = await readEvents();
  const workerEventsBefore = filterEventsForWorker(eventsBefore, { workerName, workerPhone });
  const workerHistory = buildWorkerHistoryPrompt(workerEventsBefore);

  if (isWebhookSource(source) && workerPhone) {
    const recentSimilarEvent = findRecentSimilarSavedEvent({
      events: workerEventsBefore,
      message,
      withinMinutes: 24 * 60,
    });
    if (recentSimilarEvent) {
      return buildDuplicateSavedEventResponse({
        requestId,
        receivedAt,
        source,
        externalMessageId,
        workerName,
        workerPhone,
        message,
        savedEvent: recentSimilarEvent,
      });
    }
  }

  const conversationContext = await buildMessageWithConversationContext({
    source,
    workerPhone,
    message,
  });
  const effectiveMessage = conversationContext.message;

  const historyQuery = answerHistoryQuery({
    message: effectiveMessage,
    workerName,
    workerPhone,
    workerEvents: workerEventsBefore,
  });

  if (historyQuery) {
    const responsePayload = {
      ok: true,
      requestId,
      mode: "history-query",
      llm: {
        provider: envConfig.llmProvider,
        configured: Boolean(envConfig.apiKey),
        mode: "deterministic-history-query",
      },
      trii: {
        ...buildTriiStatus(),
      },
      normalizedEvent: null,
      normalizedEvents: [],
      normalizedWork: null,
      userProfile,
      registrationFlow,
      tracking: null,
      historyQuery,
      missingFields: [],
      isComplete: false,
      extractionConfidence: 1,
      clarificationMessage: null,
      workerFeedback: historyQuery.answer,
      savedEvent: null,
      savedEvents: [],
      savedWork: null,
      events: eventsBefore,
      works: eventsBefore,
      metrics: buildMetricsFromEvents(eventsBefore),
      triiDelivery: null,
      contextLearningSuggestion: null,
    };

    if (sendViaTriiRequested && workerPhone) {
      responsePayload.triiDelivery = await sendViaTrii({
        phone: workerPhone,
        text: historyQuery.answer,
        context: "worker-history-query",
      });
    }

    await logInteraction({
      timestamp: new Date().toISOString(),
      requestId,
      receivedAt,
      source,
      input: {
        workerName,
        workerPhone,
        message,
        effectiveMessage,
        conversationContext,
        sendViaTriiRequested,
        externalMessageId,
      },
      reasoning: {
        llm: responsePayload.llm,
        reasoningTrace: {
          mode: "deterministic-history-query",
          queryType: historyQuery.type,
          matchedEvents: historyQuery.matchedEvents,
        },
      },
      output: {
        ok: responsePayload.ok,
        isComplete: responsePayload.isComplete,
        missingFields: responsePayload.missingFields,
        extractionConfidence: responsePayload.extractionConfidence,
        normalizedEvent: null,
        normalizedEvents: [],
        clarificationMessage: responsePayload.clarificationMessage,
        workerFeedback: responsePayload.workerFeedback,
        tracking: null,
        savedEventId: null,
        savedEventIds: [],
        triiDelivery: responsePayload.triiDelivery,
        contextLearningSuggestion: null,
        registrationFlow,
        historyQuery,
      },
    });

    return responsePayload;
  }

  if (shouldAskForFirstEconomicEvent(effectiveMessage)) {
    const clarificationMessage = buildFirstEconomicEventPrompt({ workerName, registrationFlow, ownerContext });
    const responsePayload = {
      ok: true,
      requestId,
      llm: {
        provider: envConfig.llmProvider,
        configured: Boolean(envConfig.apiKey),
        mode: "registration-flow",
      },
      trii: {
        ...buildTriiStatus(),
      },
      normalizedEvent: sanitizeNormalizedEvent({
        workerName,
        workerPhone,
        sourceMessage: effectiveMessage,
      }),
      normalizedEvents: [],
      normalizedWork: null,
      userProfile,
      registrationFlow,
      tracking: null,
      missingFields: ["economicLabel", "economicKind", "eventSummary"],
      isComplete: false,
      extractionConfidence: 0,
      clarificationMessage,
      workerFeedback: clarificationMessage,
      savedEvent: null,
      savedEvents: [],
      savedWork: null,
      events: eventsBefore,
      works: eventsBefore,
      metrics: buildMetricsFromEvents(eventsBefore),
      triiDelivery: null,
      contextLearningSuggestion: null,
    };

    if (sendViaTriiRequested && workerPhone) {
      responsePayload.triiDelivery = await sendViaTrii({
        phone: workerPhone,
        text: clarificationMessage,
        context: "registration-first-economic-event",
      });
    }

    await logInteraction({
      timestamp: new Date().toISOString(),
      requestId,
      receivedAt,
      source,
      input: {
        workerName,
        workerPhone,
        message,
        effectiveMessage,
        conversationContext,
        sendViaTriiRequested,
        externalMessageId,
      },
      reasoning: {
        llm: responsePayload.llm,
        reasoningTrace: {
          mode: "registration-flow",
          reason: "Nuevo mensaje sin señales suficientes de evento económico.",
        },
      },
      output: {
        ok: responsePayload.ok,
        isComplete: responsePayload.isComplete,
        missingFields: responsePayload.missingFields,
        extractionConfidence: responsePayload.extractionConfidence,
        normalizedEvent: responsePayload.normalizedEvent,
        normalizedEvents: responsePayload.normalizedEvents,
        clarificationMessage: responsePayload.clarificationMessage,
        workerFeedback: responsePayload.workerFeedback,
        tracking: responsePayload.tracking,
        savedEventId: null,
        savedEventIds: [],
        triiDelivery: responsePayload.triiDelivery,
        contextLearningSuggestion: null,
        registrationFlow,
      },
    });

    return responsePayload;
  }

  const analysis = await interpretMessage({ message: effectiveMessage, workerName, workerPhone, workerHistory });
  const normalizedEvent = sanitizeNormalizedEvent(
    enrichOwnerObservationFields(
      enrichEventIdentity(analysis.normalizedEvent || analysis.normalizedWork || {}, {
        workerName,
        workerPhone,
      }),
      effectiveMessage
    )
  );
  const normalizedEvents = buildNormalizedEventsFromMessage({
    message: effectiveMessage,
    baseEvent: normalizedEvent,
    workerName,
    workerPhone,
  });
  const eventsMissingFields = normalizedEvents.map((event) => normalizeMissingFields([], event));
  const hasMultipleEvents = normalizedEvents.length > 1;
  analysis.missingFields = hasMultipleEvents
    ? [...new Set(eventsMissingFields.flat())]
    : normalizeMissingFields(analysis.missingFields, normalizedEvent);
  analysis.isComplete = hasMultipleEvents
    ? eventsMissingFields.every((fields) => fields.length === 0)
    : analysis.missingFields.length === 0;
  analysis.extractionConfidence = normalizeConfidence(
    analysis.extractionConfidence,
    analysis.missingFields,
    analysis.isComplete
  );
  const tracking = buildWorkerTracking({ normalizedEvent, previousEvents: workerEventsBefore });
  analysis.workerFeedback = buildWarmWorkerFeedback({
    normalizedEvent,
    missingFields: analysis.missingFields,
    isComplete: analysis.isComplete,
    baseFeedback: analysis.workerFeedback,
    tracking,
    workerName,
    registrationFlow,
  });
  if (hasMultipleEvents) {
    analysis.workerFeedback = buildMultipleEventsFeedback({
      events: normalizedEvents,
      missingFields: analysis.missingFields,
      isComplete: analysis.isComplete,
      workerName,
      registrationFlow,
    });
  }
  const contextLearningSuggestion = await suggestContextLearning({
    message: effectiveMessage,
    normalizedEvent,
    analysis,
    ownerContext,
  });

  if (contextLearningSuggestion && (contextLearningSuggestion.businessContextAddition || contextLearningSuggestion.interpretationRuleAddition)) {
    await saveLearningSuggestion(contextLearningSuggestion, {
      workerName,
      workerPhone,
      sourceMessage: effectiveMessage,
    });
  }

  let savedEvent = null;
  let savedEvents = [];
  let events = eventsBefore;
  let metrics = buildMetricsFromEvents(events);
  let triiDelivery = null;

  if (analysis.isComplete) {
    savedEvents = await saveEvents(normalizedEvents);
    savedEvent = savedEvents[0] || null;
    events = await readEvents();
    metrics = buildMetricsFromEvents(events);
  }

  if (sendViaTriiRequested && workerPhone) {
    const outboundText = analysis.isComplete ? analysis.workerFeedback : analysis.clarificationMessage;
    triiDelivery = await sendViaTrii({
      phone: workerPhone,
      text: outboundText,
      context: analysis.isComplete ? "worker-feedback" : "clarification",
    });
  }

  const responsePayload = {
    ok: true,
    requestId,
    llm: analysis.llm,
    trii: {
      ...buildTriiStatus(),
    },
    normalizedEvent,
    normalizedEvents,
    normalizedWork: normalizedEvent,
    userProfile,
    registrationFlow,
    tracking,
    missingFields: analysis.missingFields,
    isComplete: analysis.isComplete,
    extractionConfidence: analysis.extractionConfidence,
    clarificationMessage: analysis.clarificationMessage,
    workerFeedback: analysis.workerFeedback,
    savedEvent,
    savedEvents,
    savedWork: savedEvent,
    events,
    works: events,
    metrics,
    triiDelivery,
    contextLearningSuggestion,
  };

  await logInteraction({
    timestamp: new Date().toISOString(),
    requestId,
    receivedAt,
    source,
    input: {
      workerName,
      workerPhone,
      message,
      effectiveMessage,
      conversationContext,
      sendViaTriiRequested,
      externalMessageId,
    },
    reasoning: buildReasoningLogEntry(analysis),
    output: {
      ok: responsePayload.ok,
      isComplete: responsePayload.isComplete,
      missingFields: responsePayload.missingFields,
      extractionConfidence: responsePayload.extractionConfidence,
      normalizedEvent: responsePayload.normalizedEvent,
      normalizedEvents: responsePayload.normalizedEvents,
      clarificationMessage: responsePayload.clarificationMessage,
      workerFeedback: responsePayload.workerFeedback,
      tracking: responsePayload.tracking,
      savedEventId: responsePayload.savedEvent?.id || null,
      savedEventIds: responsePayload.savedEvents?.map((event) => event.id) || [],
      triiDelivery: responsePayload.triiDelivery,
      contextLearningSuggestion: responsePayload.contextLearningSuggestion,
      registrationFlow,
    },
  });

  return responsePayload;
}

async function interpretMessage({ message, workerName, workerPhone, workerHistory }) {
  const heuristic = heuristicInterpretation({ message, workerName, workerPhone });
  const ownerContext = await readOwnerContext();

  if (!envConfig.apiKey) {
    return {
      ...heuristic,
      llm: {
        provider: envConfig.llmProvider,
        configured: false,
        mode: "heuristic-fallback",
        note: "No hay API key configurada.",
      },
      reasoningTrace: {
        mode: "heuristic-fallback",
        liveAttempted: false,
        fallbackReason: "No hay API key configurada.",
        heuristicSignals: heuristic.reasoning,
      },
    };
  }

  const prompt = buildPrompt({ message, workerName, workerPhone, workerHistory, ownerContext });
  const compactSystemPrompt = compactPromptText(ownerContext.systemPrompt);

  try {
    const raw = await requestLlmCompletion({
      systemPrompt: ownerContext.systemPrompt,
      prompt,
    });

    const modelContentRaw = extractModelContent(raw, { stripThink: false });
    const modelContentVisible = stripThinkTags(modelContentRaw);
    const parsed = extractJson(modelContentVisible);
    const normalizedEvent = sanitizeNormalizedEvent(
      parsed.normalizedEvent || parsed.normalizedWork || {}
    );
    const missingFields = normalizeMissingFields(parsed.missingFields, normalizedEvent);
    const isComplete = missingFields.length === 0;
    const extractionConfidence = normalizeConfidence(parsed.extractionConfidence, missingFields, isComplete);

    return {
      normalizedEvent,
      missingFields,
      isComplete,
      extractionConfidence,
      clarificationMessage:
        parsed.clarificationMessage || buildClarificationMessage(missingFields, normalizedEvent),
      workerFeedback:
        parsed.workerFeedback || buildWorkerFeedback(normalizedEvent, missingFields, isComplete),
      llm: {
        provider: envConfig.llmProvider,
        configured: true,
        mode: "live",
        model: envConfig.model,
      },
      reasoningTrace: {
        mode: "live",
        liveAttempted: true,
        request: {
          systemPrompt: compactSystemPrompt,
          prompt,
        },
        response: {
          rawApiResponse: raw,
          modelContentRaw,
          modelContentVisible,
          parsed,
        },
      },
    };
  } catch (error) {
    return {
      ...heuristic,
      llm: {
        provider: envConfig.llmProvider,
        configured: true,
        mode: "heuristic-fallback",
        note: error instanceof Error ? error.message : String(error),
      },
      reasoningTrace: {
        mode: "heuristic-fallback",
        liveAttempted: true,
        request: {
          systemPrompt: compactSystemPrompt,
          prompt,
        },
        fallbackReason: error instanceof Error ? error.message : String(error),
        heuristicSignals: heuristic.reasoning,
      },
    };
  }
}

function buildPrompt({ message, workerName, workerPhone, workerHistory, ownerContext }) {
  const today = new Date().toISOString().slice(0, 10);
  const savedContext = normalizeOwnerContext(ownerContext);
  const values = {
    today,
    businessContext: compactContextField(savedContext.businessContext),
    interpretationRules: compactContextField(savedContext.interpretationRules),
    workerName: workerName || "desconocido",
    workerPhone: workerPhone || "desconocido",
    workerHistory: workerHistory || "Sin historial previo.",
    message: message || "",
  };
  const prompt = applyPromptTemplate(savedContext.promptTemplate, values);
  const historyBlock = prompt.includes(values.workerHistory)
    ? ""
    : `\n\nHistorial del trabajador:\n${values.workerHistory}`;
  return compactPromptText(`${prompt}${historyBlock}`);
}

async function requestLlmCompletion({ systemPrompt, prompt }) {
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), envConfig.llmTimeoutMs);

    try {
      const response = await fetch(`${envConfig.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${envConfig.apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: envConfig.model,
          temperature: 0.2,
          max_completion_tokens: envConfig.llmMaxCompletionTokens,
          response_format: {
            type: "json_object",
          },
          messages: [
            {
              role: "system",
              content: compactPromptText(systemPrompt),
            },
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
      });

      const raw = await response.text();
      if (!response.ok) {
        const error = new Error(`${envConfig.llmProvider} error ${response.status}: ${raw}`);
        if (attempt < 3 && shouldRetryLlm(response.status, raw)) {
          lastError = error;
          await wait(backoffMs(attempt));
          continue;
        }
        throw error;
      }

      return raw;
    } catch (error) {
      const normalizedError = normalizeLlmError(error);
      if (attempt < 3 && shouldRetryLlmError(normalizedError)) {
        lastError = normalizedError;
        await wait(backoffMs(attempt));
        continue;
      }
      throw normalizedError;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error(`${envConfig.llmProvider} no respondió.`);
}

function shouldRetryLlm(status, raw) {
  return [429, 502, 503, 504, 529].includes(Number(status)) || /overloaded_error|high load|rate limit/i.test(String(raw || ""));
}

function shouldRetryLlmError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return /529|overloaded_error|high load|rate limit|timeout|timed out|fetch failed|econnreset|socket hang up|aborted/.test(message);
}

function normalizeLlmError(error) {
  if (error instanceof Error && error.name === "AbortError") {
    return new Error(`${envConfig.llmProvider} timeout`);
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}

function backoffMs(attempt) {
  return 350 * attempt + Math.floor(Math.random() * 250);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadDotEnv(filePath) {
  try {
    const content = readFileSync(filePath, "utf8");
    for (const rawLine of content.replace(/^\uFEFF/, "").split(/\r?\n/)) {
      const line = rawLine.trim().replace(/^\uFEFF/, "");
      if (!line || line.startsWith("#")) continue;
      const separator = line.indexOf("=");
      if (separator <= 0) continue;
      const key = line.slice(0, separator).trim();
      let value = line.slice(separator + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env is optional; production can still use real environment variables.
  }
}

function compactContextField(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function compactPromptText(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .reduce((acc, line) => {
      if (!line && acc[acc.length - 1] === "") return acc;
      acc.push(line);
      return acc;
    }, [])
    .join("\n")
    .trim();
}

function heuristicInterpretation({ message, workerName, workerPhone }) {
  const amount = parseAmount(message);
  const date = parseDate(message);
  const derivedCategory = parseCategory(message);
  const economicKind = parseEconomicKind(message);
  const executionStatus = parseExecutionStatus(message);
  const paymentStatus = parsePaymentStatus(message, executionStatus, amount);
  const economicLabel = parseEconomicLabel(message, economicKind, derivedCategory);

  const normalizedEvent = sanitizeNormalizedEvent({
    workerName: workerName || null,
    workerPhone: workerPhone || null,
    economicLabel,
    economicKind,
    executionStatus,
    paymentStatus,
    derivedCategory,
    eventSummary: message,
    amount,
    currency: "ARS",
    date,
    broadArea: parseLocation(message),
    evidenceType: parseEvidence(message),
    sourceMessage: message,
  });

  const missingFields = normalizeMissingFields([], normalizedEvent);
  const isComplete = missingFields.length === 0;

  return {
    normalizedEvent,
    missingFields,
    isComplete,
    clarificationMessage: buildClarificationMessage(missingFields, normalizedEvent),
    workerFeedback: buildWorkerFeedback(normalizedEvent, missingFields, isComplete),
    extractionConfidence: isComplete ? 0.8 : 0.58,
    reasoning: {
      parser: "heuristic",
      amount,
      date,
      derivedCategory,
      economicKind,
      executionStatus,
      paymentStatus,
      economicLabel,
      broadArea: normalizedEvent.broadArea,
      evidenceType: normalizedEvent.evidenceType,
    },
  };
}

async function suggestContextLearning({ message, normalizedEvent, analysis, ownerContext }) {
  if (!message) return null;

  if (!envConfig.apiKey) {
    return heuristicContextSuggestion({ normalizedEvent, analysis, ownerContext });
  }

  try {
    const response = await fetch(`${envConfig.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${envConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: envConfig.model,
        temperature: 0.2,
        max_completion_tokens: envConfig.llmMaxCompletionTokens,
        response_format: {
          type: "json_object",
        },
        messages: [
          {
            role: "system",
            content:
              "Eres un analista de aprendizaje de contexto para TECO. Devuelves únicamente JSON válido y sin markdown.",
          },
          {
            role: "user",
            content: buildLearningSuggestionPrompt({ message, normalizedEvent, analysis, ownerContext }),
          },
        ],
      }),
    });

    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`${envConfig.llmProvider} suggestion error ${response.status}: ${raw}`);
    }

    const parsed = extractJson(extractModelContent(raw));
    const suggestion = sanitizeContextSuggestion(parsed.contextLearningSuggestion || parsed);
    return suggestion || heuristicContextSuggestion({ normalizedEvent, analysis, ownerContext, message });
  } catch {
    return heuristicContextSuggestion({ normalizedEvent, analysis, ownerContext, message });
  }
}

function buildLearningSuggestionPrompt({ message, normalizedEvent, analysis, ownerContext }) {
  const savedContext = normalizeOwnerContext(ownerContext);

  return `
Estamos evaluando si el último mensaje deja una enseñanza útil para el contexto base de TECO.

Contexto actual del negocio:
${savedContext.businessContext}

Reglas actuales del agente:
${savedContext.interpretationRules}

Mensaje recibido:
"""${message}"""

Evento interpretado:
${JSON.stringify(normalizedEvent, null, 2)}

Campos faltantes:
${JSON.stringify(analysis.missingFields || [])}

Devuelve únicamente JSON válido con esta forma:
{
  "contextLearningSuggestion": {
    "shouldSuggest": boolean,
    "reason": string,
    "businessContextAddition": string|null,
    "interpretationRuleAddition": string|null
  }
}

Reglas:
- Solo sugerir si este mensaje realmente aporta algo reusable para mensajes futuros.
- No repetir algo que ya esté cubierto en el contexto actual.
- Mantener las sugerencias cortas, concretas y listas para pegar.
- Si no hay aprendizaje reusable, devolver shouldSuggest = false y campos null.
- Responder en español.
- No agregar texto fuera del JSON.
`.trim();
}

function heuristicContextSuggestion({ normalizedEvent, analysis, ownerContext, message }) {
  const savedContext = normalizeOwnerContext(ownerContext);
  const businessAdditions = [];
  const ruleAdditions = [];

  if (
    normalizedEvent.economicKind === "producto" &&
    !containsInsensitive(savedContext.businessContext, "producto")
  ) {
    businessAdditions.push(
      "También registramos venta de productos como parte de los eventos económicos del trabajador."
    );
  }

  if (
    normalizedEvent.paymentStatus === "pendiente_cobro" &&
    !containsInsensitive(savedContext.interpretationRules, "pendiente de cobro")
  ) {
    ruleAdditions.push(
      "Si el evento todavía no fue cobrado, marcarlo como pendiente de cobro."
    );
  }

  if (
    normalizedEvent.executionStatus === "realizado" &&
    analysis.missingFields?.includes("paymentStatus") &&
    !containsInsensitive(savedContext.interpretationRules, "si ya cobró")
  ) {
    ruleAdditions.push(
      "Si el evento fue realizado pero no queda claro si cobró, preguntar por el cobro antes de cerrar el registro."
    );
  }

  if (
    normalizedEvent.economicKind === "producto" &&
    normalizedEvent.amount &&
    !containsInsensitive(savedContext.interpretationRules, "producto")
  ) {
    ruleAdditions.push(
      "Cuando el mensaje sea una venta de producto, conservar tipo de producto, cantidad si aparece y monto final."
    );
  }

  if (
    normalizedEvent.economicKind === "producto" &&
    /\b\d+\b/.test(String(message || "")) &&
    !containsInsensitive(savedContext.interpretationRules, "cantidad")
  ) {
    ruleAdditions.push(
      "Si el mensaje de producto menciona cantidad o unidades, conservar ese dato dentro del registro y el resumen."
    );
  }

  if (
    normalizedEvent.evidenceType &&
    !containsInsensitive(savedContext.interpretationRules, "evidencia") &&
    !containsInsensitive(savedContext.interpretationRules, "comprobante")
  ) {
    ruleAdditions.push(
      "Si el mensaje menciona comprobante, transferencia o anotación, conservar ese tipo de evidencia cuando aporte contexto útil."
    );
  }

  const suggestion = sanitizeContextSuggestion({
    shouldSuggest: businessAdditions.length > 0 || ruleAdditions.length > 0,
    reason:
      businessAdditions.length > 0 || ruleAdditions.length > 0
        ? "Este mensaje aporta una regla reusable para futuros eventos parecidos."
        : "No se detectó aprendizaje reusable nuevo.",
    businessContextAddition: businessAdditions.join("\n"),
    interpretationRuleAddition: ruleAdditions.join("\n"),
  });

  return suggestion;
}

function sanitizeNormalizedEvent(input) {
  const executionStatus = normalizeExecutionStatus(input.executionStatus || input.workStatus);
  let paymentStatus = normalizePaymentStatus(input.paymentStatus);

  const sourceMessage = cleanNullable(input.sourceMessage);
  const derivedCategory = cleanNullable(input.derivedCategory);
  const commercialStatus = normalizeCommercialStatus(input.commercialStatus);
  const inferredKind = parseEconomicKind(
    `${cleanNullable(input.economicLabel) || cleanNullable(input.workLabel) || ""} ${sourceMessage || ""}`
  );
  const fallbackKind =
    inferredKind ||
    (derivedCategory
      ? derivedCategory.toLowerCase().includes("venta")
        ? "producto"
        : "servicio"
      : null);

  if (!paymentStatus && executionStatus === "pendiente") {
    paymentStatus = "pendiente_cobro";
  }

  if (!paymentStatus && executionStatus === "realizado") {
    paymentStatus = parsePaymentStatus(sourceMessage || "", executionStatus, input.amount) || null;
  }

  if (
    paymentStatus &&
    executionStatus === "realizado" &&
    sourceMessage &&
    !parsePaymentStatus(sourceMessage, executionStatus, input.amount)
  ) {
    paymentStatus = null;
  }

  return {
    id: input.id || null,
    workerName: cleanNullable(input.workerName),
    workerPhone: cleanNullable(input.workerPhone),
    economicLabel: cleanNullable(input.economicLabel || input.workLabel),
    economicKind: normalizeEconomicKind(input.economicKind || input.eventType || fallbackKind),
    executionStatus,
    paymentStatus,
    derivedCategory,
    eventSummary: cleanNullable(input.eventSummary || input.workSummary),
    amount: normalizeAmount(input.amount),
    currency: cleanNullable(input.currency) || "ARS",
    date: normalizeDate(input.date),
    broadArea: cleanNullable(input.broadArea),
    evidenceType: cleanNullable(input.evidenceType),
    commercialStatus,
    quotedAmount: normalizeAmount(input.quotedAmount),
    startDate: cleanNullable(input.startDate),
    endDate: cleanNullable(input.endDate),
    estimatedDuration: cleanNullable(input.estimatedDuration),
    collaborators: normalizeCollaborators(input.collaborators),
    splitRule: cleanNullable(input.splitRule),
    netIncome: normalizeAmount(input.netIncome),
    quantity: normalizeAmount(input.quantity),
    unit: cleanNullable(input.unit),
    moneyParsingNote: cleanNullable(input.moneyParsingNote),
    grossAmount: normalizeAmount(input.grossAmount),
    costAmount: normalizeAmount(input.costAmount),
    costDescription: cleanNullable(input.costDescription),
    deductionAmount: normalizeAmount(input.deductionAmount),
    deductionDescription: cleanNullable(input.deductionDescription),
    sourceMessage,
  };
}

function normalizeOwnerContext(input) {
  return {
    businessContext: cleanNullable(input?.businessContext) || defaultOwnerContext.businessContext,
    interpretationRules: cleanNullable(input?.interpretationRules) || defaultOwnerContext.interpretationRules,
    systemPrompt: cleanNullable(input?.systemPrompt) || defaultOwnerContext.systemPrompt,
    promptTemplate: cleanNullable(input?.promptTemplate) || defaultOwnerContext.promptTemplate,
    welcomeMessage: cleanNullable(input?.welcomeMessage) || defaultOwnerContext.welcomeMessage,
    dataUsageNotice: cleanNullable(input?.dataUsageNotice) || defaultOwnerContext.dataUsageNotice,
    updatedAt: cleanNullable(input?.updatedAt),
  };
}

function sanitizeContextSuggestion(input) {
  if (!input) return null;

  const businessContextAddition = cleanNullable(input.businessContextAddition);
  const interpretationRuleAddition = cleanNullable(input.interpretationRuleAddition);
  const shouldSuggest =
    Boolean(input.shouldSuggest) && Boolean(businessContextAddition || interpretationRuleAddition);

  if (!shouldSuggest) return null;

  return {
    shouldSuggest: true,
    reason:
      cleanNullable(input.reason) ||
      "El agente detectó algo reusable para mejorar el contexto base.",
    businessContextAddition,
    interpretationRuleAddition,
  };
}

function applyPromptTemplate(template, values) {
  return String(template || defaultOwnerContext.promptTemplate).replace(
    /\{\{\s*(\w+)\s*\}\}/g,
    (_, key) => values[key] ?? ""
  );
}

function containsInsensitive(source, snippet) {
  const left = String(source || "").toLowerCase();
  const right = String(snippet || "").toLowerCase();
  return Boolean(right) && left.includes(right);
}

function normalizeStoredEvent(raw) {
  const event = sanitizeNormalizedEvent(raw);
  return {
    ...event,
    createdAt: raw.createdAt || null,
  };
}

function normalizeUserProfile(raw) {
  const phone = normalizePhone(raw?.phone);
  if (!phone) return null;
  return {
    id: cleanNullable(raw.id) || crypto.randomUUID(),
    name: cleanNullable(raw.name),
    phone,
    source: cleanNullable(raw.source) || "manual-ui",
    createdAt: cleanNullable(raw.createdAt),
    updatedAt: cleanNullable(raw.updatedAt),
    lastSeenAt: cleanNullable(raw.lastSeenAt),
  };
}

function cleanNullable(value) {
  if (value === undefined || value === null) return null;
  const clean = String(value).trim();
  return clean ? clean : null;
}

function normalizeAmount(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = typeof value === "string" ? parseMoneyValue(value) : null;
  const n = parsed?.amount ?? Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeCommercialStatus(value) {
  const clean = cleanNullable(value)?.toLowerCase();
  if (!clean) return null;
  if (clean.includes("cotiz") || clean.includes("presup")) return "cotizacion";
  if (clean.includes("confirm")) return "confirmado";
  if (clean.includes("real")) return "realizado";
  if (clean.includes("pend")) return "pendiente";
  return null;
}

function normalizeCollaborators(value) {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : String(value).split(/[,;]+/);
  return raw
    .map((item) => cleanNullable(item))
    .filter(Boolean)
    .map((item) => item.replace(/\s+/g, " "))
    .filter((item, index, list) => list.findIndex((candidate) => candidate.toLowerCase() === item.toLowerCase()) === index)
    .slice(0, 6);
}

function normalizeDate(value) {
  if (!value) return null;
  const stringValue = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) return stringValue;
  const date = new Date(stringValue);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function normalizeEconomicKind(value) {
  const clean = cleanNullable(value)?.toLowerCase();
  if (!clean) return null;
  if (clean.includes("serv")) return "servicio";
  if (clean.includes("prod") || clean.includes("venta")) return "producto";
  return null;
}

function normalizeExecutionStatus(value) {
  const clean = cleanNullable(value)?.toLowerCase();
  if (!clean) return null;
  if (clean === "a_realizarse") return "pendiente";
  if (clean.includes("pend")) return "pendiente";
  if (clean.includes("real")) return "realizado";
  return null;
}

function normalizePaymentStatus(value) {
  const clean = cleanNullable(value)?.toLowerCase();
  if (!clean) return null;
  if (clean.includes("cobrado")) return "cobrado";
  if (clean.includes("pend")) return "pendiente_cobro";
  return null;
}

function normalizeConfidence(value, missingFields, isComplete) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) return parsed;
  return isComplete && missingFields.length === 0 ? 0.82 : 0.55;
}

function normalizeMissingFields(fields, normalizedEvent) {
  const allowedFields = new Set([
    "economicLabel",
    "economicKind",
    "executionStatus",
    "paymentStatus",
    "eventSummary",
    "amount",
    "quotedAmount",
    "date",
    "startDate",
    "endDate",
    "estimatedDuration",
  ]);

  const set = new Set(
    Array.isArray(fields)
      ? fields.map((item) => String(item).trim()).filter((item) => allowedFields.has(item))
      : []
  );

  if (normalizedEvent.economicLabel) set.delete("economicLabel");
  if (normalizedEvent.economicKind) set.delete("economicKind");
  if (normalizedEvent.executionStatus) set.delete("executionStatus");
  if (normalizedEvent.paymentStatus) set.delete("paymentStatus");
  if (normalizedEvent.eventSummary) set.delete("eventSummary");
  if (normalizedEvent.amount !== null) set.delete("amount");
  if (normalizedEvent.quotedAmount !== null) set.delete("quotedAmount");
  if (normalizedEvent.date) set.delete("date");

  if (!normalizedEvent.economicLabel) set.add("economicLabel");
  if (!normalizedEvent.economicKind) set.add("economicKind");
  if (!normalizedEvent.executionStatus) set.add("executionStatus");
  if (!normalizedEvent.eventSummary) set.add("eventSummary");

  if (normalizedEvent.executionStatus === "realizado") {
    if (!normalizedEvent.paymentStatus) set.add("paymentStatus");
    if (normalizedEvent.amount === null) set.add("amount");
    if (!normalizedEvent.date) set.add("date");
  } else if (normalizedEvent.executionStatus === "pendiente") {
    set.delete("paymentStatus");
    set.delete("amount");
    if (
      normalizedEvent.commercialStatus === "cotizacion" &&
      (normalizedEvent.startDate || normalizedEvent.endDate || normalizedEvent.estimatedDuration)
    ) {
      set.delete("date");
    } else if (!normalizedEvent.date) {
      set.add("date");
    }
  }

  if (
    normalizedEvent.commercialStatus === "cotizacion" &&
    normalizedEvent.quotedAmount === null &&
    normalizedEvent.amount === null
  ) {
    set.add("quotedAmount");
    set.delete("amount");
  }

  return [...set];
}

function buildClarificationMessage(missingFields, normalizedEvent) {
  if (!missingFields.length) {
    return `Perfecto. Ya tengo registrado el evento económico "${normalizedEvent.economicLabel || "sin título"}".`;
  }

  if (missingFields.length === 1 && missingFields[0] === "paymentStatus") {
    return "¿Ya te pagaron o queda pendiente de cobro?";
  }

  const friendly = {
    economicLabel: "qué pasó concretamente",
    economicKind: "si fue servicio o producto",
    executionStatus: "si ya se hizo o sigue pendiente",
    paymentStatus: "si ya lo cobraste o queda pendiente de cobro",
    eventSummary: "un resumen corto del evento",
    amount: "el monto",
    quotedAmount: "el monto cotizado",
    date: "la fecha",
  };

  const list = missingFields.map((field) => friendly[field] || field).join(", ");
  return `Para dejar este evento económico bien registrado me falta confirmar ${list}.`;
}

function buildWorkerFeedback(normalizedEvent, missingFields, isComplete) {
  if (isComplete) {
    const kind = normalizedEvent.economicKind || "evento";
    const label = normalizedEvent.economicLabel || "sin detalle";
    const payment =
      normalizedEvent.paymentStatus === "cobrado" ? "cobrado" : "pendiente de cobro";

    if (normalizedEvent.commercialStatus === "cotizacion") {
      const when = [normalizedEvent.startDate, normalizedEvent.endDate]
        .filter(Boolean)
        .join(" a ");
      return `Listo. Dejé registrada la cotización "${label}" por ${formatCurrency(normalizedEvent.quotedAmount || normalizedEvent.amount)}${when ? `, con plazo ${when}` : ""}.`;
    }

    if (normalizedEvent.executionStatus === "pendiente") {
      return `Listo. Dejé registrado un ${kind} pendiente: ${label} para ${normalizedEvent.date}.`;
    }

    return `Listo. Registré el ${kind} "${label}" por ${formatCurrency(normalizedEvent.amount)} con fecha ${normalizedEvent.date} y estado ${payment}.`;
  }

  return "Tengo una base del evento económico, pero todavía necesito algunos datos antes de guardarlo definitivamente.";
}

function buildWarmWorkerFeedback({
  normalizedEvent,
  missingFields,
  isComplete,
  baseFeedback,
  tracking,
  workerName,
  registrationFlow,
}) {
  const name = firstName(workerName || normalizedEvent.workerName) || "genial";
  const label = normalizedEvent.economicLabel || "este movimiento";
  const parts = [];

  if (registrationFlow?.isNewUser) {
    parts.push(
      `Hola ${name}. Ya identifiqué este número para que tus próximos registros queden juntos.`
    );
  }

  if (isComplete) {
    parts.push(buildWorkerFeedback(normalizedEvent, missingFields, isComplete));
  } else {
    parts.push(buildClarificationMessage(missingFields, normalizedEvent));
  }

  if (!isComplete && missingFields?.length === 1 && missingFields[0] === "paymentStatus") {
    return parts.join(" ");
  }

  if (tracking?.categoryLabel) {
    const ordinal = ordinalText(tracking.categoryCount);
    parts.push(
      `Buen dato, ${name}: este es tu ${ordinal} registro de ${tracking.categoryLabel}.`
    );
  } else {
    parts.push(`Buen dato, ${name}: ya dejé ordenado "${label}" para tu seguimiento.`);
  }

  if (tracking?.amountComparison?.message) {
    parts.push(tracking.amountComparison.message);
  } else if (tracking?.currentAmount) {
    parts.push(`Monto registrado: ${formatCurrency(tracking.currentAmount)}.`);
  }

  const extraNotes = buildWorkerExtraNotes(normalizedEvent);
  if (extraNotes.length) {
    parts.push(extraNotes.join(" "));
  }

  if (tracking?.workerTotals) {
    const totals = tracking.workerTotals;
    parts.push(
      `En total llevás ${totals.totalEvents} evento${totals.totalEvents === 1 ? "" : "s"} registrado${totals.totalEvents === 1 ? "" : "s"} y ${formatCurrency(totals.totalCollected)} cobrado.`
    );
  }

  if (!isComplete && missingFields?.length) {
    parts.push(`Para cerrarlo bien, solo falta confirmar: ${humanMissingList(missingFields)}.`);
  }

  return parts.filter(Boolean).join(" ");
}

function buildMultipleEventsFeedback({ events, missingFields, isComplete, workerName, registrationFlow }) {
  const name = firstName(workerName || events[0]?.workerName) || "genial";
  const prefix = registrationFlow?.isNewUser
    ? `Hola ${name}. Ya identifiqué este número para que tus próximos registros queden juntos. `
    : "";
  if (!isComplete) {
    return `${prefix}Tengo varios eventos detectados para ${name}, pero antes de guardarlos falta confirmar: ${humanMissingList(missingFields)}.`;
  }

  const paid = events.filter((event) => event.paymentStatus === "cobrado").length;
  const pending = events.length - paid;
  const total = events.reduce((sum, event) => sum + (Number(event.amount) || 0), 0);
  const labels = events
    .slice(0, 4)
    .map((event) => `${event.economicLabel || "evento"} (${formatCurrency(event.amount || 0)}, ${event.paymentStatus === "cobrado" ? "cobrado" : "pendiente"})`)
    .join("; ");

  return `${prefix}Listo, ${name}. Separé este mensaje en ${events.length} eventos económicos: ${labels}. Total informado: ${formatCurrency(total)}. Quedaron ${paid} cobrados y ${pending} pendiente${pending === 1 ? "" : "s"} de cobro.`;
}

function buildWorkerExtraNotes(normalizedEvent) {
  const notes = [];
  if (normalizedEvent.quantity && normalizedEvent.unit) {
    notes.push(`También guardé la cantidad: ${normalizedEvent.quantity} ${normalizedEvent.unit}.`);
  }
  if (normalizedEvent.collaborators?.length) {
    notes.push(`Lo marqué con ayuda de ${normalizedEvent.collaborators.join(", ")}.`);
  }
  if (normalizedEvent.splitRule) {
    notes.push(`Reparto anotado: ${normalizedEvent.splitRule}.`);
  }
  if (normalizedEvent.netIncome) {
    notes.push(`Ganancia estimada para vos: ${formatCurrency(normalizedEvent.netIncome)}.`);
  }
  if (normalizedEvent.moneyParsingNote) {
    notes.push("El monto quedó leído, pero conviene revisar el formato si usaste punto o coma.");
  }
  return notes;
}

function shouldAskForFirstEconomicEvent(message) {
  const text = normalizeTextKey(message);
  if (!text) return true;

  const hasEconomicSignal =
    /\b(arreglo|arregle|arreglé|instale|instalacion|instalación|cobre|cobré|cobro|cobrado|vend[ií]|vendo|venta|trabajo|servicio|producto|presupuesto|cotizacion|cotización|plomer|electric|gasist|clase|cliente|pague|pagaron|me deben|pendiente|transferencia|efectivo|\$|[0-9]{3,})\b/i.test(
      String(message || "")
    );

  if (hasEconomicSignal) return false;

  const onlyGreetingOrProbe =
    /^(hola|buen dia|buenas|buenas tardes|buenas noches|test|test2|ping|que|que tal|probando|recibido|ok|gracias|como funciona|ayuda)[\s?.!]*$/i.test(
      text
    );
  return onlyGreetingOrProbe || text.length < 12;
}

function buildFirstEconomicEventPrompt({ workerName, registrationFlow, ownerContext }) {
  const name = firstName(workerName) || "genial";
  const welcomeMsg = ownerContext?.welcomeMessage || `Hola ${name}. Ya identifiqué este número para registrar tus movimientos. `;
  const dataNotice = ownerContext?.dataUsageNotice ? ` ${ownerContext.dataUsageNotice}` : "";
  const prefix = registrationFlow?.isNewUser ? welcomeMsg.replace(/\.$/, ". ") : `Hola ${name}. `;
  return `${prefix}${dataNotice}Para empezar, mandame el primer evento económico en una frase. Por ejemplo: "Hoy hice una plomería por 50000 y ya me pagaron" o "Vendí 3 productos por 120000 y queda pendiente de cobro".`;
}

function answerHistoryQuery({ message, workerName, workerEvents }) {
  const text = normalizeTextKey(message);
  if (!isHistoryQuery(text)) return null;

  const name = firstName(workerName) || "genial";
  const events = Array.isArray(workerEvents) ? workerEvents.filter(Boolean) : [];
  const filters = extractHistoryQueryFilters(message);
  const filteredEvents = filterEventsForHistoryQuery(events, filters);
  const scopedEvents = filteredEvents.length || filters.hasFilter ? filteredEvents : events;

  if (!events.length) {
    return {
      type: "no-history",
      filters,
      matchedEvents: 0,
      answer: `Todavía no tengo eventos registrados para este número. Cuando cargues algunos trabajos o ventas, voy a poder responderte totales, trabajos más caros y pendientes.`,
    };
  }

  if (!scopedEvents.length) {
    return {
      type: "no-matches",
      filters,
      matchedEvents: 0,
      answer: `No encontré registros que coincidan con esa consulta, ${name}. Probá preguntarme por otro cliente, zona, rubro o período.`,
    };
  }

  const asksAmountTotal = /\b(cuanto|cuánto|total|cobre|cobré|cobrado|ingrese|ingresé|facture|facturé|recaude|recaudé|llevo)\b/i.test(message);
  const asksMaxAmount = /\b(mas caro|más caro|mayor monto|mejor pago|mas grande|más grande|mejor cobrado|mejor pago)\b/i.test(message);

  if (asksAmountTotal && asksMaxAmount) {
    return {
      type: "total-and-max-amount",
      filters,
      matchedEvents: scopedEvents.length,
      answer: buildHistorySummaryAnswer({ name, events: scopedEvents, filters }),
    };
  }

  if (asksMaxAmount) {
    const event = scopedEvents
      .filter((item) => Number(item.amount) > 0)
      .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))[0];
    if (!event) return buildNoAmountHistoryAnswer({ name, filters, matchedEvents: scopedEvents.length });
    return {
      type: "max-amount",
      filters,
      matchedEvents: scopedEvents.length,
      answer: `${name}, el registro más caro que encontré fue "${event.economicLabel || "evento"}" por ${formatCurrency(event.amount)}${event.date ? ` el ${event.date}` : ""}.${formatEventContext(event)}`,
    };
  }

  if (/\b(mas tiempo|más tiempo|demoro mas|demoró más|tardo mas|tardó más|duracion|duración)\b/i.test(message)) {
    const ranked = scopedEvents
      .map((event) => ({ event, duration: estimateEventDurationScore(event) }))
      .filter((item) => item.duration.score !== null)
      .sort((a, b) => b.duration.score - a.duration.score);
    if (!ranked.length) {
      return {
        type: "max-duration-no-data",
        filters,
        matchedEvents: scopedEvents.length,
        answer: `${name}, encontré ${scopedEvents.length} registro${scopedEvents.length === 1 ? "" : "s"}, pero no tengo duración anotada como para decir cuál llevó más tiempo.`,
      };
    }
    const top = ranked[0];
    return {
      type: "max-duration",
      filters,
      matchedEvents: scopedEvents.length,
      answer: `${name}, el que más tiempo parece haber llevado fue "${top.event.economicLabel || "evento"}"${top.duration.label ? ` (${top.duration.label})` : ""}${top.event.date ? ` el ${top.event.date}` : ""}.${formatEventContext(top.event)}`,
    };
  }

  if (asksAmountTotal) {
    const collected = scopedEvents.filter((event) => event.paymentStatus === "cobrado" || Number(event.amount) > 0);
    const total = collected.reduce((sum, event) => sum + (Number(event.amount) || 0), 0);
    const unitAnswer = buildUnitPriceAnswer({ message, events: scopedEvents, total, name, filters });
    if (unitAnswer) return unitAnswer;
    return {
      type: "total-collected",
      filters,
      matchedEvents: scopedEvents.length,
      answer: `${name}, en ${describeHistoryScope(filters)} tengo ${scopedEvents.length} registro${scopedEvents.length === 1 ? "" : "s"} y un total de ${formatCurrency(total)} registrado${scopedEvents.length === 1 ? "" : "s"}.`,
    };
  }

  if (/\b(cuantos|cuántos|cantidad)\b/i.test(message)) {
    return {
      type: "count",
      filters,
      matchedEvents: scopedEvents.length,
      answer: `${name}, encontré ${scopedEvents.length} evento${scopedEvents.length === 1 ? "" : "s"} en ${describeHistoryScope(filters)}.`,
    };
  }

  if (/\b(pendiente|deben|falta cobrar|sin cobrar)\b/i.test(message)) {
    const pending = scopedEvents.filter((event) => event.paymentStatus !== "cobrado");
    const total = pending.reduce((sum, event) => sum + (Number(event.amount) || 0), 0);
    return {
      type: "pending-collection",
      filters,
      matchedEvents: pending.length,
      answer: `${name}, encontré ${pending.length} evento${pending.length === 1 ? "" : "s"} pendiente${pending.length === 1 ? "" : "s"} de cobro por ${formatCurrency(total)} en total.`,
    };
  }

  return {
    type: "summary",
    filters,
    matchedEvents: scopedEvents.length,
    answer: buildHistorySummaryAnswer({ name, events: scopedEvents, filters }),
  };
}

function isHistoryQuery(text) {
  if (!text) return false;
  return (
    /\b(cuanto|cuánto|cuantos|cuántos|cual|cuál|total|resumen|historial|estadistica|estadísticas|estadisticas|metricas|métricas|me deben|pendiente|mas caro|más caro|mayor monto|mas tiempo|más tiempo|duracion|duración|cobre|cobré|recaude|recaudé|llevo|consulta|consultar|pregunta)\b/i.test(text) &&
    !/\b(hoy|ayer|realice|realicé|arregle|arreglé|instale|instalé|vendi|vendí|cobre\s+\d|cobré\s+\d|me pagaron)\b/i.test(text)
  );
}

function extractHistoryQueryFilters(message) {
  const raw = String(message || "");
  const text = normalizeTextKey(raw);
  const placeMatch =
    raw.match(/(?:en|de|para)\s+(?:la\s+)?(?:casa\s+de\s+)?(?:los\s+|las\s+|el\s+|la\s+)?([A-Za-zÁÉÍÓÚáéíóúÑñ0-9\s]+?)(?:\?|$|,|\.| durante| en \d{4})/i) ||
    null;
  const query = cleanNullable(placeMatch?.[1]) || null;
  const month = parseHistoryMonthFilter(text);
  const kind = /\b(producto|productos|venta|ventas)\b/i.test(text)
    ? "producto"
    : /\b(servicio|servicios)\b/i.test(text)
      ? "servicio"
      : null;

  return {
    query,
    queryKey: query ? normalizeTextKey(query) : null,
    month,
    kind,
    hasFilter: Boolean(query || month || kind),
  };
}

function parseHistoryMonthFilter(text) {
  const months = [
    ["enero", "01"],
    ["febrero", "02"],
    ["marzo", "03"],
    ["abril", "04"],
    ["mayo", "05"],
    ["junio", "06"],
    ["julio", "07"],
    ["agosto", "08"],
    ["septiembre", "09"],
    ["setiembre", "09"],
    ["octubre", "10"],
    ["noviembre", "11"],
    ["diciembre", "12"],
  ];
  const yearMatch = text.match(/\b(20\d{2})\b/);
  const year = yearMatch?.[1] || new Date().getFullYear().toString();
  const found = months.find(([name]) => text.includes(name));
  return found ? `${year}-${found[1]}` : null;
}

function filterEventsForHistoryQuery(events, filters) {
  return events.filter((event) => {
    if (filters.kind && event.economicKind !== filters.kind) return false;
    if (filters.month && (!event.date || !event.date.startsWith(filters.month))) return false;
    if (filters.queryKey) {
      const haystack = normalizeTextKey(
        [
          event.economicLabel,
          event.eventSummary,
          event.broadArea,
          event.derivedCategory,
          event.sourceMessage,
        ]
          .filter(Boolean)
          .join(" ")
      );
      if (!haystack.includes(filters.queryKey)) return false;
    }
    return true;
  });
}

function buildUnitPriceAnswer({ message, events, total, name, filters }) {
  if (!/\b(m2|metro|metros|metro cuadrado|metros cuadrados)\b/i.test(message)) return null;
  const quantity = events.reduce((sum, event) => {
    const unit = normalizeTextKey(event.unit);
    const quantityValue = Number(event.quantity) || extractSquareMeters(event);
    return unit.includes("m2") || unit.includes("metro") || quantityValue ? sum + (quantityValue || 0) : sum;
  }, 0);
  if (!quantity) {
    return {
      type: "unit-price-no-data",
      filters,
      matchedEvents: events.length,
      answer: `${name}, encontré ${events.length} registro${events.length === 1 ? "" : "s"} para esa consulta, pero no tengo metros cuadrados anotados para calcular el precio por m2.`,
    };
  }
  return {
    type: "unit-price-m2",
    filters,
    matchedEvents: events.length,
    answer: `${name}, en ${describeHistoryScope(filters)} tengo ${formatCurrency(total)} sobre ${quantity} m2. Promedio: ${formatCurrency(total / quantity)} por m2.`,
  };
}

function extractSquareMeters(event) {
  const text = [event.economicLabel, event.eventSummary, event.sourceMessage].filter(Boolean).join(" ");
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*(?:m2|metros?\s+cuadrados?)/i);
  if (!match) return 0;
  return Number(String(match[1]).replace(",", ".")) || 0;
}

function estimateEventDurationScore(event) {
  const text = [event.estimatedDuration, event.eventSummary, event.sourceMessage].filter(Boolean).join(" ");
  const clean = normalizeTextKey(text);
  const match =
    clean.match(/(\d+(?:[.,]\d+)?)\s*(horas|hora|hs|dias|dia|días|día|semanas|semana)/i) ||
    null;
  if (!match) return { score: null, label: null };
  const value = Number(String(match[1]).replace(",", ".")) || 0;
  const unit = match[2];
  const multiplier = unit.startsWith("semana") ? 7 * 24 : unit.startsWith("dia") || unit.startsWith("día") ? 24 : 1;
  return {
    score: value * multiplier,
    label: `${value} ${unit}`,
  };
}

function buildNoAmountHistoryAnswer({ name, filters, matchedEvents }) {
  return {
    type: "max-amount-no-data",
    filters,
    matchedEvents,
    answer: `${name}, encontré ${matchedEvents} registro${matchedEvents === 1 ? "" : "s"}, pero ninguno tiene monto suficiente para decir cuál fue el más caro.`,
  };
}

function describeHistoryScope(filters) {
  const parts = [];
  if (filters.query) parts.push(filters.query);
  if (filters.month) parts.push(filters.month);
  if (filters.kind) parts.push(filters.kind === "producto" ? "productos" : "servicios");
  return parts.length ? parts.join(" / ") : "tu historial";
}

function buildHistorySummaryAnswer({ name, events, filters }) {
  const total = events.reduce((sum, event) => sum + (Number(event.amount) || 0), 0);
  const collected = events.filter((event) => event.paymentStatus === "cobrado");
  const pendingCollection = events.filter((event) => event.paymentStatus !== "cobrado");
  const top = events
    .filter((event) => Number(event.amount) > 0)
    .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))[0];
  const topText = top
    ? ` El mayor registro fue "${top.economicLabel || "evento"}" por ${formatCurrency(top.amount)}.`
    : "";
  return `${name}, en ${describeHistoryScope(filters)} tengo ${events.length} registro${events.length === 1 ? "" : "s"}, ${collected.length} cobrado${collected.length === 1 ? "" : "s"} y ${pendingCollection.length} pendiente${pendingCollection.length === 1 ? "" : "s"} de cobro. Total registrado: ${formatCurrency(total)}.${topText}`;
}

function formatEventContext(event) {
  const details = [];
  if (event.broadArea) details.push(`zona: ${event.broadArea}`);
  if (event.derivedCategory) details.push(`rubro: ${event.derivedCategory}`);
  return details.length ? ` (${details.join(", ")}).` : "";
}

function buildWorkerTracking({ normalizedEvent, previousEvents }) {
  const cleanPreviousEvents = Array.isArray(previousEvents) ? previousEvents : [];
  const trackingKey = getTrackingKey(normalizedEvent);
  const categoryLabel = trackingKey ? labelTrackingKey(trackingKey, normalizedEvent) : null;
  const sameCategoryEvents = trackingKey
    ? cleanPreviousEvents.filter((event) => getTrackingKey(event) === trackingKey)
    : [];
  const previousWithAmount = sameCategoryEvents.find((event) => Number(event.amount) > 0);
  const currentAmount = Number(normalizedEvent.amount) || null;
  const amountComparison =
    currentAmount && previousWithAmount?.amount
      ? buildAmountComparison(currentAmount, Number(previousWithAmount.amount), categoryLabel)
      : null;
  const projectedEvents = [normalizedEvent, ...cleanPreviousEvents].filter(Boolean);
  const collectedEvents = projectedEvents.filter((event) => event.paymentStatus === "cobrado");
  const totalCollected = collectedEvents.reduce((sum, event) => sum + (Number(event.amount) || 0), 0);

  return {
    workerPhone: normalizedEvent.workerPhone || null,
    workerName: normalizedEvent.workerName || null,
    categoryKey: trackingKey,
    categoryLabel,
    categoryCount: trackingKey ? sameCategoryEvents.length + 1 : 0,
    previousCategoryCount: sameCategoryEvents.length,
    currentAmount,
    previousAmount: previousWithAmount?.amount || null,
    amountComparison,
    workerTotals: {
      totalEvents: projectedEvents.length,
      totalCollected,
      collectedEvents: collectedEvents.length,
      pendingEvents: projectedEvents.filter((event) => event.executionStatus === "pendiente").length,
      pendingCollectionEvents: projectedEvents.filter((event) => event.paymentStatus !== "cobrado").length,
    },
  };
}

function buildAmountComparison(currentAmount, previousAmount, categoryLabel) {
  const diff = currentAmount - previousAmount;
  const abs = Math.abs(diff);
  const base = `Comparado con el anterior de ${categoryLabel || "esta categoría"},`;

  if (abs < 1) {
    return {
      direction: "equal",
      difference: 0,
      message: `${base} lo cobraste igual: ${formatCurrency(currentAmount)}.`,
    };
  }

  return {
    direction: diff > 0 ? "higher" : "lower",
    difference: abs,
    message:
      diff > 0
        ? `${base} lo cobraste ${formatCurrency(abs)} más.`
        : `${base} lo cobraste ${formatCurrency(abs)} menos.`,
  };
}

function buildWorkerHistoryPrompt(workerEvents) {
  const events = Array.isArray(workerEvents) ? workerEvents : [];
  if (!events.length) return "Sin historial previo.";

  const metrics = buildMetricsFromEvents(events);
  const topCategories = metrics.topCategories
    .slice(0, 3)
    .map((item) => `${item.name}: ${item.count}`)
    .join("; ");
  const lastEvents = events
    .slice(0, 5)
    .map((event) => {
      const amount = event.amount ? formatCurrency(event.amount) : "sin monto";
      return `${event.date || "sin fecha"} - ${event.economicLabel || "evento"} - ${amount}`;
    })
    .join(" | ");

  return compactPromptText(`
Total previo: ${events.length} eventos.
Total cobrado previo: ${formatCurrency(metrics.totalCollected || 0)}.
Categorías frecuentes: ${topCategories || "sin categorías"}.
Últimos registros: ${lastEvents}.
Usa este historial para responder con seguimiento cálido y comparaciones simples si corresponde.
`);
}

function filterEventsForWorker(events, { workerName, workerPhone }) {
  const normalizedPhone = normalizePhone(workerPhone);
  const cleanName = normalizeTextKey(workerName);
  return (Array.isArray(events) ? events : []).filter((event) => {
    if (normalizedPhone && normalizePhone(event.workerPhone) === normalizedPhone) return true;
    return Boolean(cleanName && normalizeTextKey(event.workerName) === cleanName);
  });
}

function enrichEventIdentity(event, { workerName, workerPhone }) {
  return {
    ...event,
    workerName: cleanNullable(event.workerName) || cleanNullable(workerName),
    workerPhone: normalizePhone(event.workerPhone) || normalizePhone(workerPhone),
  };
}

function buildNormalizedEventsFromMessage({ message, baseEvent, workerName, workerPhone }) {
  const source = String(message || "");
  const candidates =
    parseStructuredListEvents(source, baseEvent) ||
    parseMultiClientClassEvents(source, baseEvent) ||
    parseMultipleActionEvents(source, baseEvent) ||
    null;

  const rawEvents = candidates?.length ? candidates : [baseEvent];
  return rawEvents
    .map((event) =>
      sanitizeNormalizedEvent(
        enrichOwnerObservationFields(
          enrichEventIdentity(
            {
              ...baseEvent,
              ...event,
              sourceMessage: source,
            },
            { workerName, workerPhone }
          ),
          event.sourceFragment || source
        )
      )
    )
    .filter((event) => event.economicLabel || event.eventSummary || event.amount !== null);
}

function parseStructuredListEvents(message, baseEvent) {
  const lines = String(message || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const eventLines = lines.filter((line) => /^\d+[.)]\s+/.test(line));
  if (eventLines.length < 2) return null;

  const events = eventLines
    .map((line) => {
      const cleanLine = line.replace(/^\d+[.)]\s+/, "").trim();
      const amount = parseAmount(cleanLine);
      return buildEventFromFragment(cleanLine, baseEvent, {
        amount,
        paymentStatus: parsePaymentStatus(cleanLine, "realizado", amount) || "cobrado",
      });
    })
    .filter(Boolean);

  return events.length > 1 ? events : null;
}

function parseMultiClientClassEvents(message, baseEvent) {
  const text = String(message || "");
  if (!/\b(clase|clases|curso|alumnos?)\b/i.test(text)) return null;

  const explicit = parseNamedPaymentEvents(text, baseEvent);
  if (explicit?.length > 1) return explicit;

  const namesMatch = text.match(/\ba\s+([A-Za-zÁÉÍÓÚáéíóúñÑ,\s]+?)\.\s*(?:le\s+cobr[eé]|cobr[eé]|me\s+pagaron|pero|$)/i);
  const eachAmount =
    text.match(/(?:a\s+cada\s+uno|cada\s+uno)\D{0,20}(\$?\s*[\d.,]+\s*(?:mil|lucas|k)?)/i) ||
    text.match(/(?:le\s+cobr[eé]|cobr[eé]|cobr\w*)\s*(\$?\s*[\d.,]+\s*(?:mil|lucas|k)?)/i);
  if (!namesMatch?.[1] || !eachAmount?.[1]) return null;

  const names = splitHumanNames(namesMatch[1]);
  if (names.length < 2) return null;

  const unpaidNames = parseUnpaidNames(text);
  const amount = parseMoneyValue(eachAmount[1])?.amount ?? parseAmount(text);
  return names.map((name) =>
    buildEventFromFragment(`clase de inglés a ${name}`, baseEvent, {
      economicLabel: `Clase de inglés a ${name}`,
      economicKind: "servicio",
      derivedCategory: "clase",
      eventSummary: `Clase de inglés a ${name}`,
      amount,
      paymentStatus: unpaidNames.some((item) => sameName(item, name)) ? "pendiente_cobro" : "cobrado",
      executionStatus: "realizado",
      date: parseDate(text) || new Date().toISOString().slice(0, 10),
    })
  );
}

function parseNamedPaymentEvents(message, baseEvent) {
  const text = String(message || "");
  const events = [];
  const paidPattern =
    /\b([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚáéíóúñÑ]+)\s+(?:me\s+)?pag[oó]\s+(\$?\s*[\d.,]+\s*(?:mil|lucas|k)?)/gi;
  const compactPaidPattern =
    /(?:^|[,;.]\s*)([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚáéíóúñÑ]+)\s+(\$?\s*[\d.,]+\s*(?:mil|lucas|k)\b)/gi;
  const debtPattern =
    /\b([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚáéíóúñÑ]+)\s+(?:me\s+)?(?:queda\s+debiendo|debe|qued[oó]\s+debiendo)\s+(\$?\s*[\d.,]+\s*(?:mil|lucas|k)?)/gi;

  for (const match of text.matchAll(paidPattern)) {
    const name = cleanNullable(match[1]);
    const amount = parseMoneyValue(match[2])?.amount ?? null;
    if (!name || amount === null) continue;
    events.push(
      buildEventFromFragment(`clase a ${name}`, baseEvent, {
        economicLabel: `Clase a ${name}`,
        economicKind: "servicio",
        derivedCategory: "clase",
        eventSummary: `Clase a ${name}, cobrada`,
        amount,
        paymentStatus: "cobrado",
        executionStatus: "realizado",
        date: parseDate(text) || new Date().toISOString().slice(0, 10),
      })
    );
  }

  for (const match of text.matchAll(compactPaidPattern)) {
    const name = cleanNullable(match[1]);
    const amount = parseMoneyValue(match[2])?.amount ?? null;
    if (!name || amount === null) continue;
    events.push(
      buildEventFromFragment(`clase a ${name}`, baseEvent, {
        economicLabel: `Clase a ${name}`,
        economicKind: "servicio",
        derivedCategory: "clase",
        eventSummary: `Clase a ${name}, cobrada`,
        amount,
        paymentStatus: "cobrado",
        executionStatus: "realizado",
        date: parseDate(text) || new Date().toISOString().slice(0, 10),
      })
    );
  }

  for (const match of text.matchAll(debtPattern)) {
    const name = cleanNullable(match[1]);
    const amount = parseMoneyValue(match[2])?.amount ?? null;
    if (!name || amount === null) continue;
    events.push(
      buildEventFromFragment(`clase a ${name}`, baseEvent, {
        economicLabel: `Clase a ${name}`,
        economicKind: "servicio",
        derivedCategory: "clase",
        eventSummary: `Clase a ${name}, pendiente de cobro`,
        amount,
        paymentStatus: "pendiente_cobro",
        executionStatus: "realizado",
        date: parseDate(text) || new Date().toISOString().slice(0, 10),
      })
    );
  }

  const unique = [];
  for (const event of events) {
    if (!unique.some((item) => normalizeTextKey(item.economicLabel) === normalizeTextKey(event.economicLabel))) {
      unique.push(event);
    }
  }
  return unique.length > 1 ? unique : null;
}

function parseMultipleActionEvents(message, baseEvent) {
  const text = String(message || "");
  const matches = [
    ...text.matchAll(
      /\b(vend[ií]|arregl[eé]|cambi[eé]|decor[eé]|instal[eé]|hice|realic[eé])\s+(.+?)\s+por\s+\$?\s*([\d.,]+(?:\s*(?:mil|lucas|k))?)/gi
    ),
  ];
  if (matches.length < 2) return null;

  const allPaid = /\b(todo|todos|ambos|ambas)\s+(?:cobrado|pagado|pagados|cobrados)\b/i.test(text);
  const events = matches.map((match) => {
    const action = match[1];
    const object = cleanHumanPhrase(match[2]);
    const amount = parseMoneyValue(match[3])?.amount ?? null;
    const fragment = `${action} ${object} por ${match[3]}`;
    const kind = /^decor/i.test(action)
      ? "servicio"
      : parseEconomicKind(fragment) || parseEconomicKind(`${action} ${object}`) || baseEvent.economicKind;
    return buildEventFromFragment(fragment, baseEvent, {
      economicLabel: object ? sentenceCase(`${action} ${object}`) : parseEconomicLabel(fragment, kind, null),
      economicKind: kind,
      derivedCategory: parseCategory(fragment) || (kind === "producto" ? "venta" : baseEvent.derivedCategory),
      eventSummary: sentenceCase(fragment),
      amount,
      paymentStatus: allPaid ? "cobrado" : parsePaymentStatus(fragment, "realizado", amount),
      executionStatus: "realizado",
      date: parseDate(text) || new Date().toISOString().slice(0, 10),
    });
  });

  return events.length > 1 ? events : null;
}

function buildEventFromFragment(fragment, baseEvent, overrides = {}) {
  const amount = overrides.amount ?? parseAmount(fragment);
  const executionStatus = overrides.executionStatus || parseExecutionStatus(fragment);
  return {
    ...baseEvent,
    economicLabel:
      cleanNullable(overrides.economicLabel) ||
      parseEconomicLabel(fragment, overrides.economicKind || baseEvent.economicKind, overrides.derivedCategory) ||
      cleanHumanPhrase(fragment),
    economicKind: overrides.economicKind || parseEconomicKind(fragment) || baseEvent.economicKind,
    executionStatus,
    paymentStatus:
      overrides.paymentStatus || parsePaymentStatus(fragment, executionStatus, amount) || baseEvent.paymentStatus,
    derivedCategory: overrides.derivedCategory || parseCategory(fragment) || baseEvent.derivedCategory,
    eventSummary: cleanNullable(overrides.eventSummary) || sentenceCase(fragment),
    amount,
    date: overrides.date || parseDate(fragment) || baseEvent.date || new Date().toISOString().slice(0, 10),
    sourceFragment: fragment,
    ...overrides,
  };
}

function enrichOwnerObservationFields(event, message) {
  const source = String(message || event?.sourceMessage || "");
  const enriched = { ...event, sourceMessage: cleanNullable(event?.sourceMessage) || source };
  const commercialStatus = parseCommercialStatus(source);
  const amountInfo = parseMoneyInfo(source);
  const schedule = parseScheduleInfo(source);
  const collaboration = parseCollaborationInfo(source, normalizeAmount(enriched.amount));
  const measure = parseQuantityUnit(source);
  const finance = parseFinancialAdjustments(source, normalizeAmount(enriched.amount));

  if (!enriched.economicKind) {
    enriched.economicKind = parseEconomicKind(source);
  }
  if (!enriched.derivedCategory) {
    enriched.derivedCategory = parseCategory(source);
  }
  if (!enriched.economicLabel) {
    enriched.economicLabel = parseEconomicLabel(source, enriched.economicKind, enriched.derivedCategory);
  }
  if (!enriched.eventSummary) {
    enriched.eventSummary = source;
  }
  if (!enriched.date) {
    enriched.date = parseDate(source);
  }

  if (commercialStatus && !enriched.commercialStatus) {
    enriched.commercialStatus = commercialStatus;
  }

  if (commercialStatus === "cotizacion") {
    const quoteHasVisit = /\b(fui\s+a\s+ver|visité|visite|revis[eé]|diagn[oó]stico|diagnostico)\b/i.test(source);
    enriched.executionStatus = quoteHasVisit ? "realizado" : "pendiente";
    enriched.economicKind = enriched.economicKind || "servicio";
    enriched.paymentStatus = "pendiente_cobro";
    const quotedAmountFromText = amountInfo?.amount ?? parseMoneyAfterQuoteWord(source);
    enriched.quotedAmount = normalizeAmount(enriched.quotedAmount) ?? normalizeAmount(enriched.amount) ?? quotedAmountFromText ?? null;
    if (
      enriched.quotedAmount !== null &&
      enriched.quotedAmount > 0 &&
      enriched.quotedAmount < 1000 &&
      /\b(cotiz\w*|presupuest\w*|pas[eé])\b/i.test(source)
    ) {
      enriched.quotedAmount *= 1000;
    }
    enriched.amount = normalizeAmount(enriched.amount) ?? enriched.quotedAmount;
    if (enriched.amount !== null && enriched.amount > 0 && enriched.amount < 1000 && enriched.quotedAmount >= 1000) {
      enriched.amount = enriched.quotedAmount;
    }
    const visitLabel = cleanNullable(source.match(/\bfui\s+a\s+ver\s+(.+?)\s+y\s+pas[eé]\s+presupuesto/i)?.[1]);
    const quotedWorkLabel =
      cleanNullable(source.match(/\b(?:cotiz|presupuest)[A-Za-zÁÉÍÓÚáéíóúñÑ]*\s+\$?\s*[\d.,]+\s*(?:mil|lucas|k)?\s+por\s+(.+?)(?:,|\.| capaz| pero|$)/i)?.[1]) ||
      cleanNullable(source.match(/\bpas[eé]\s+\$?\s*[\d.,]+\s*(?:mil|lucas|k)?\s+por\s+(.+?)(?:,|\.| capaz| pero|$)/i)?.[1]);
    const currentCotizacionLabel = cleanNullable(enriched.economicLabel);
    enriched.economicLabel =
      currentCotizacionLabel && !/^\s*(de\s+)?\$?\s*[\d.,]/i.test(currentCotizacionLabel)
        ? currentCotizacionLabel
        : visitLabel ||
      quotedWorkLabel ||
      parseEconomicLabel(source, enriched.economicKind, enriched.derivedCategory) ||
      `Cotización de ${enriched.derivedCategory || enriched.economicKind || "evento económico"}`;
    enriched.eventSummary = cleanNullable(enriched.eventSummary) || source;
  }

  if (schedule.startDate && !enriched.startDate) enriched.startDate = schedule.startDate;
  if (schedule.endDate && !enriched.endDate) enriched.endDate = schedule.endDate;
  if (schedule.estimatedDuration && !enriched.estimatedDuration) {
    enriched.estimatedDuration = schedule.estimatedDuration;
  }

  if (
    amountInfo?.amount !== null &&
    amountInfo?.amount !== undefined &&
    /\b(lucas|mil|k)\b/i.test(source) &&
    normalizeAmount(enriched.amount) !== amountInfo.amount
  ) {
    enriched.amount = amountInfo.amount;
    if (commercialStatus === "cotizacion") enriched.quotedAmount = amountInfo.amount;
  }

  const effectiveCollaboration = parseCollaborationInfo(source, normalizeAmount(enriched.amount));
  if (effectiveCollaboration.collaborators.length && !normalizeCollaborators(enriched.collaborators).length) {
    enriched.collaborators = effectiveCollaboration.collaborators;
  }
  if (effectiveCollaboration.splitRule && !enriched.splitRule) enriched.splitRule = effectiveCollaboration.splitRule;
  if (effectiveCollaboration.netIncome !== null) {
    enriched.netIncome = effectiveCollaboration.netIncome;
  }

  if (measure.quantity !== null && normalizeAmount(enriched.quantity) === null) {
    enriched.quantity = measure.quantity;
  }
  if (measure.unit && !enriched.unit) enriched.unit = measure.unit;
  if (amountInfo?.note && !enriched.moneyParsingNote) enriched.moneyParsingNote = amountInfo.note;
  if (finance.grossAmount !== null) enriched.grossAmount = finance.grossAmount;
  if (finance.costAmount !== null) enriched.costAmount = finance.costAmount;
  if (finance.costDescription) enriched.costDescription = finance.costDescription;
  if (finance.deductionAmount !== null) enriched.deductionAmount = finance.deductionAmount;
  if (finance.deductionDescription) enriched.deductionDescription = finance.deductionDescription;
  if (finance.netIncome !== null) enriched.netIncome = finance.netIncome;
  if (finance.isAdvance) {
    enriched.economicKind = enriched.economicKind || "servicio";
    enriched.executionStatus = "pendiente";
    enriched.paymentStatus = "cobrado";
    enriched.date = enriched.date || new Date().toISOString().slice(0, 10);
    if (!enriched.startDate && /\bsemana\s+que\s+viene\b/i.test(source)) {
      enriched.startDate = "semana que viene";
    }
  }
  if ((finance.costAmount !== null || finance.deductionAmount !== null) && !enriched.paymentStatus) {
    enriched.paymentStatus = "cobrado";
  }
  if (!enriched.date && normalizeAmount(enriched.amount) !== null && enriched.executionStatus) {
    enriched.date = new Date().toISOString().slice(0, 10);
  }

  return enriched;
}

function parseCommercialStatus(message) {
  const lower = String(message || "").toLowerCase();
  if (
    /\b(cotiz\w*|presupuest\w*|presupuesto)\b/i.test(lower) ||
    /\bpas[eé]\s+(?:precio|presupuesto|\$?\s*[\d.,]+\s*(?:mil|lucas|k)?)\b/i.test(lower)
  ) {
    return "cotizacion";
  }
  if (/\b(confirm[oó]|acept[oó]|cerr[eé])\b/i.test(lower)) return "confirmado";
  if (/\b(pendiente|si acepta|por confirmar)\b/i.test(lower)) return "pendiente";
  return null;
}

function parseScheduleInfo(message) {
  const text = String(message || "");
  const start =
    text.match(/\b(?:empiezo|arranco|inicio|comienzo)\s+(?:el\s+)?([^.,;]+?)(?=\s+(?:y|pero|si|,|\.|termino|finalizo)\b|[.,;]|$)/i) ||
    text.match(/\b(?:para|desde)\s+(?:el\s+)?([^.,;]+?)(?=\s+(?:y|hasta|,|\.)\b|[.,;]|$)/i);
  const end =
    text.match(/\b(?:termino|finalizo|entrego|hasta)\s+(?:el\s+)?([^.,;]+?)(?=\s+(?:si|,|\.)\b|[.,;]|$)/i);
  const duration =
    text.match(/\b(?:dura|demora|lleva|me lleva)\s+([^.,;]+?)(?=\s+(?:y|pero|,|\.)\b|[.,;]|$)/i) ||
    text.match(/\bpor\s+(\d+\s+(?:hora|horas|d[ií]a|d[ií]as|semana|semanas))\b/i);

  return {
    startDate: start?.[1] ? cleanHumanPhrase(start[1]) : null,
    endDate: end?.[1] ? cleanHumanPhrase(end[1]) : null,
    estimatedDuration: duration?.[1] ? cleanHumanPhrase(duration[1]) : null,
  };
}

function parseCollaborationInfo(message, amount) {
  const text = String(message || "");
  const collaborators = [];
  const patterns = [
    /\b(?:con|junto con)\s+([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚáéíóúñÑ]+)(?=\b|,|\.|;)/g,
    /\b(?:me ayuda|me ayud[oó]|lo hago con|trabajo con)\s+([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚáéíóúñÑ]+)(?=\b|,|\.|;)/gi,
    /\bayuda de\s+([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚáéíóúñÑ]+)(?=\b|,|\.|;)/gi,
    /\b(?:con|junto con)\s+(?:mi|su|un|una|el|la)\s+(hermano|hermana|asistente|ayudante|socio|socia|compa(?:ñ|n)ero|compa(?:ñ|n)era)\b/gi,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const name = cleanNullable(match[1]);
      if (name && !/transferencia|efectivo|comprobante|factura/i.test(name)) collaborators.push(name);
    }
  }

  const uniqueCollaborators = normalizeCollaborators(collaborators);
  const splitRule =
    /\b(mitad y mitad|50\/50|cincuenta y cincuenta)\b/i.test(text)
      ? "mitad y mitad"
      : cleanNullable(text.match(/\b(\d{1,2})\s*\/\s*(\d{1,2})\b/)?.[0]);

  let netIncome = null;
  if (amount && splitRule === "mitad y mitad") {
    netIncome = amount / (uniqueCollaborators.length ? uniqueCollaborators.length + 1 : 2);
  }

  return { collaborators: uniqueCollaborators, splitRule, netIncome };
}

function parseFinancialAdjustments(message, amount) {
  const text = String(message || "");
  const grossAmount = amount ?? parseAmount(text);
  const costMatch =
    text.match(/\b(?:gast[eé]|gaste|pagu[eé]|compr[eé])\s+\$?\s*([\d.,]+(?:\s*(?:mil|lucas|k))?)\s+(?:en|de)\s+([^.,;]+)/i) ||
    text.match(/\b(?:costo|costo de|materiales?)\s+\$?\s*([\d.,]+(?:\s*(?:mil|lucas|k))?)(?:\s+([^.,;]+))?/i);
  const deductionMatch =
    text.match(/\b(?:retuvo|retuvieron|descont[oó]|descontaron|me descont[oó])\s+\$?\s*([\d.,]+(?:\s*(?:mil|lucas|k))?)(?:\s+(?:por|porque|de)\s+([^.,;]+))?/i) ||
    text.match(/\b(?:menos|descuento|retenci[oó]n)\s+\$?\s*([\d.,]+(?:\s*(?:mil|lucas|k))?)(?:\s+([^.,;]+))?/i);
  const costAmount = costMatch?.[1] ? parseMoneyValue(costMatch[1])?.amount ?? null : null;
  const deductionAmount = deductionMatch?.[1] ? parseMoneyValue(deductionMatch[1])?.amount ?? null : null;
  const totalAdjustments = (costAmount || 0) + (deductionAmount || 0);
  const netIncome = grossAmount !== null && totalAdjustments > 0 ? grossAmount - totalAdjustments : null;

  return {
    grossAmount: totalAdjustments > 0 ? grossAmount : null,
    costAmount,
    costDescription: costMatch?.[2] ? cleanHumanPhrase(costMatch[2]) : null,
    deductionAmount,
    deductionDescription: deductionMatch?.[2] ? cleanHumanPhrase(deductionMatch[2]) : null,
    netIncome,
    isAdvance: /\b(adelantaron|anticipo|se[ñn]a|me se[ñn]aron)\b/i.test(text),
  };
}

function parseQuantityUnit(message) {
  const text = String(message || "");
  const dozen = text.match(/\b(?:una\s+)?docena(?:\s+de\s+([A-Za-zÁÉÍÓÚáéíóúñÑ]+))?/i);
  if (dozen) {
    return {
      quantity: 12,
      unit: cleanNullable(dozen[1]) ? `docena de ${cleanNullable(dozen[1])}` : "docena",
    };
  }

  const match = text.match(
    /\b(\d+(?:[.,]\d+)?)\s+(botellas?|cajas?|bidones?|litros?|unidades?|pares?|docenas?|lentes?|aceites?|filtros?)\b/i
  );
  if (!match) return { quantity: null, unit: null };

  const parsed = parseMoneyValue(match[1]);
  return {
    quantity: parsed?.amount ?? Number(match[1].replace(",", ".")),
    unit: cleanNullable(match[2]?.toLowerCase()),
  };
}

function cleanHumanPhrase(value) {
  return cleanNullable(value)?.replace(/\s+/g, " ").replace(/[.,;]+$/, "") || null;
}

function splitHumanNames(value) {
  return String(value || "")
    .replace(/\s+y\s+/gi, ",")
    .split(/[,;]/)
    .map((item) => cleanHumanPhrase(item))
    .filter(Boolean)
    .filter((item) => !/\b(le|les|me|cobre|cobré|pague|pagué|pero|hoy)\b/i.test(item))
    .slice(0, 20);
}

function parseUnpaidNames(message) {
  const text = String(message || "");
  const match =
    text.match(/\bpero\s+(.+?)\s+no\s+me\s+pagaron\b/i) ||
    text.match(/\b(.+?)\s+(?:me\s+)?(?:queda(?:n)?\s+debiendo|deben)\b/i);
  return match?.[1] ? splitHumanNames(match[1]) : [];
}

function sameName(left, right) {
  return normalizeTextKey(left) === normalizeTextKey(right);
}

function sentenceCase(value) {
  const clean = cleanHumanPhrase(value);
  if (!clean) return null;
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function getTrackingKey(event) {
  const text = normalizeTextKey(
    [event?.derivedCategory, event?.economicLabel, event?.eventSummary, event?.sourceMessage]
      .filter(Boolean)
      .join(" ")
  );
  if (!text) return null;

  const catalog = [
    ["plomeria", ["plomer", "canilla", "caño", "cano", "perdida de agua", "sanitari"]],
    ["electricidad", ["electric", "tablero", "disyuntor", "luz"]],
    ["pintura", ["pintur", "pinto", "pinte"]],
    ["limpieza", ["limpieza", "limpie", "aseo"]],
    ["instalacion", ["instal", "coloc", "montaje"]],
    ["albanileria", ["alban", "pared", "revoque", "mamposter"]],
    ["clase", ["clase", "curso", "alumno", "ensen"]],
    ["venta", ["venta", "vendi", "vendio", "producto", "aceite", "lente", "auto", "stock"]],
  ];

  for (const [key, keywords] of catalog) {
    if (keywords.some((keyword) => text.includes(keyword))) return key;
  }

  return normalizeTextKey(event?.derivedCategory || event?.economicKind || event?.economicLabel)
    .split(" ")
    .slice(0, 3)
    .join(" ") || null;
}

function labelTrackingKey(key, event) {
  const labels = {
    plomeria: "plomería",
    electricidad: "electricidad",
    pintura: "pintura",
    limpieza: "limpieza",
    instalacion: "instalación",
    albanileria: "albañilería",
    clase: "clases",
    venta: event?.economicKind === "producto" ? "ventas" : "ventas",
  };
  return labels[key] || event?.derivedCategory || event?.economicKind || key;
}

function firstName(value) {
  const clean = cleanNullable(value);
  return clean ? clean.split(/\s+/)[0] : null;
}

function ordinalText(value) {
  const n = Number(value) || 1;
  const words = {
    1: "primer",
    2: "segundo",
    3: "tercer",
    4: "cuarto",
    5: "quinto",
    6: "sexto",
    7: "séptimo",
    8: "octavo",
    9: "noveno",
    10: "décimo",
  };
  return words[n] || `${n}°`;
}

function humanMissingList(missingFields) {
  const labels = {
    economicLabel: "qué pasó",
    economicKind: "si fue servicio o producto",
    executionStatus: "si ya se hizo",
    paymentStatus: "si ya cobraste",
    eventSummary: "un resumen",
    amount: "monto",
    quotedAmount: "monto cotizado",
    date: "fecha",
  };
  return missingFields.map((field) => labels[field] || field).join(", ");
}

function normalizeTextKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function buildState() {
  const events = await readEvents();
  const suggestions = await readLearningSuggestions();
  const pendingSuggestions = suggestions.filter((s) => s.status === "pending").length;
  return {
    events,
    works: events,
    users: await readUsers(),
    metrics: buildMetricsFromEvents(events),
    ownerContext: await readOwnerContext(),
    agentContextOverview: buildAgentContextOverview(),
    pendingSuggestions,
    llm: {
      provider: envConfig.llmProvider,
      configured: Boolean(envConfig.apiKey),
      model: envConfig.model,
    },
    trii: {
      ...buildTriiStatus(),
    },
    storage: {
      mode: sqliteStorageReady ? "sqlite" : "json",
      sqliteReady: sqliteStorageReady,
      sqliteDriver,
      database: sqliteStorageReady ? sqliteFile : null,
    },
    exportUrl: "/api/export.csv",
  };
}

function buildAgentContextOverview() {
  return {
    automaticContext: [
      "La fecha del día al momento de procesar.",
      "El nombre del trabajador, si está cargado.",
      "El teléfono del trabajador, si está cargado.",
      "El mensaje completo que llega en esa prueba.",
      "El historial anterior del mismo teléfono para seguimiento y comparación.",
      "La guía editable que los dueños dejaron guardada.",
    ],
    internalRules: [
      "Siempre intenta ordenar el mensaje como un evento económico.",
      "Distingue si el caso es servicio o producto.",
      "Distingue si está realizado o pendiente.",
      "Distingue si está cobrado o pendiente de cobro.",
      "Si el evento fue realizado, necesita qué pasó, tipo, estado, resumen, cobro, monto y fecha.",
      "Si el evento está pendiente, no obliga monto ni cobro, pero sí necesita fecha.",
      "Si el mensaje es una cotización o presupuesto, conserva monto cotizado, inicio, fin o duración si aparecen.",
      "Si el trabajador menciona ayuda de otra persona, conserva colaborador, reparto y ganancia estimada cuando sea simple.",
      "Si el mensaje incluye cantidad o medida, conserva unidades como docena, cajas, botellas o litros.",
      "Si el monto usa punto o coma, intenta leerlo y deja una nota cuando pueda generar confusión.",
      "La zona y la evidencia suman contexto, aunque no siempre bloquean el registro.",
      "Si falta algo importante, prepara una pregunta corta para completarlo.",
      "En cada interacción intenta devolver seguimiento personal: cuántos eventos lleva, categoría repetida y comparación de monto si existe historial.",
    ],
    fallbackRules: [
      "Si el modelo no responde bien, usa una lectura de respaldo por reglas.",
      "Si hay duda, prioriza no inventar datos.",
      "Si no está claro el cobro en un evento realizado, lo deja para confirmar.",
      "Solo sugiere aprendizajes nuevos si parecen reutilizables para casos futuros.",
    ],
  };
}

async function ensureWorksFile() {
  try {
    await access(worksFile);
  } catch {
    await writeFile(worksFile, "[]", "utf8");
  }
}

async function ensureUsersFile() {
  try {
    await access(usersFile);
  } catch {
    await writeFile(usersFile, "[]", "utf8");
  }
}

async function ensureOwnerContextFile() {
  try {
    await access(ownerContextFile);
  } catch {
    await writeFile(ownerContextFile, JSON.stringify(defaultOwnerContext, null, 2), "utf8");
  }
}

async function ensureLearningSuggestionsFile() {
  try {
    await access(learningSuggestionsFile);
  } catch {
    await writeFile(learningSuggestionsFile, "[]", "utf8");
  }
}

async function ensureLogsDir() {
  await mkdir(interactionLogsDir, { recursive: true });
}

async function ensureSqliteStorage() {
  try {
    try {
      const sqlite = await import("node:sqlite");
      sqliteDb = new sqlite.DatabaseSync(sqliteFile);
      sqliteDriver = "node";
    } catch {
      execFileSync("sqlite3", ["--version"], { encoding: "utf8" });
      sqliteDb = null;
      sqliteDriver = "cli";
    }

    sqliteExec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT,
        phone TEXT NOT NULL UNIQUE,
        source TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        worker_name TEXT,
        worker_phone TEXT,
        economic_label TEXT,
        economic_kind TEXT,
        execution_status TEXT,
        payment_status TEXT,
        derived_category TEXT,
        amount REAL,
        currency TEXT,
        date TEXT,
        source_message TEXT,
        created_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS owner_context (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        updated_at TEXT,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS interactions (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        request_id TEXT,
        external_message_id TEXT UNIQUE,
        received_at TEXT,
        source TEXT,
        worker_name TEXT,
        worker_phone TEXT,
        message TEXT,
        is_complete INTEGER,
        saved_event_ids TEXT,
        response_text TEXT,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS learning_suggestions (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        reason TEXT,
        business_context_addition TEXT,
        interpretation_rule_addition TEXT,
        source_message TEXT,
        worker_name TEXT,
        worker_phone TEXT,
        payload_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_events_worker_phone ON events(worker_phone);
      CREATE INDEX IF NOT EXISTS idx_interactions_timestamp ON interactions(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_interactions_worker_phone ON interactions(worker_phone);
      CREATE INDEX IF NOT EXISTS idx_learning_suggestions_status ON learning_suggestions(status);
      CREATE INDEX IF NOT EXISTS idx_learning_suggestions_created_at ON learning_suggestions(created_at DESC);
    `);
    ensureSqliteColumn("interactions", "external_message_id", "TEXT");
    sqliteExec(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_interactions_external_message_id ON interactions(external_message_id);"
    );
    sqliteStorageReady = true;
    await backfillSqliteStorage();
  } catch (error) {
    sqliteStorageReady = false;
    sqliteDb = null;
    sqliteDriver = null;
    console.warn("SQLite no disponible, se conserva persistencia JSON:", error?.message || error);
  }
}

function ensureSqliteColumn(tableName, columnName, definition) {
  const columns = sqliteAll(`PRAGMA table_info(${tableName})`);
  if (columns.some((column) => column.name === columnName)) return;
  sqliteRun(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function sqliteExec(sql) {
  if (sqliteDriver === "node") {
    sqliteDb.exec(sql);
    return "";
  }
  return execFileSync("sqlite3", [sqliteFile, sql], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

function sqliteRun(sql, params = []) {
  if (sqliteDriver === "node") {
    sqliteDb.prepare(sql).run(...params);
    return;
  }
  sqliteExec(applySqliteParams(sql, params));
}

function sqliteAll(sql, params = []) {
  if (sqliteDriver === "node") {
    return sqliteDb.prepare(sql).all(...params);
  }
  const output = execFileSync("sqlite3", ["-json", sqliteFile, applySqliteParams(sql, params)], {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  }).trim();
  return output ? JSON.parse(output) : [];
}

function sqliteGet(sql, params = []) {
  return sqliteAll(sql, params)[0] || null;
}

function applySqliteParams(sql, params) {
  let index = 0;
  return sql.replace(/\?/g, () => sqliteValue(params[index++]));
}

function sqliteValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function backfillSqliteStorage() {
  if (!sqliteStorageReady) return;

  const eventCount = sqliteGet("SELECT COUNT(*) AS count FROM events")?.count || 0;
  if (!eventCount) {
    for (const event of await readJsonEvents()) {
      insertSqliteEvent(event);
    }
  }

  const userCount = sqliteGet("SELECT COUNT(*) AS count FROM users")?.count || 0;
  if (!userCount) {
    for (const user of await readJsonUsers()) {
      insertSqliteUser(user);
    }
  }

  const contextCount = sqliteGet("SELECT COUNT(*) AS count FROM owner_context")?.count || 0;
  if (!contextCount) {
    insertSqliteOwnerContext(await readJsonOwnerContext());
  }

  const interactionCount =
    sqliteGet("SELECT COUNT(*) AS count FROM interactions")?.count || 0;
  if (!interactionCount) {
    for (const entry of await readJsonInteractionLogs()) {
      insertSqliteInteraction(entry);
    }
  }

  const suggestionCount = sqliteGet("SELECT COUNT(*) AS count FROM learning_suggestions")?.count || 0;
  if (!suggestionCount) {
    for (const suggestion of await readJsonLearningSuggestions()) {
      insertSqliteLearningSuggestion(suggestion);
    }
  }
}

async function readJsonEvents() {
  const raw = await readFile(worksFile, "utf8");
  const parsed = JSON.parse(raw || "[]");
  if (!Array.isArray(parsed)) return [];
  return parsed.map(normalizeStoredEvent);
}

async function readJsonUsers() {
  const raw = await readFile(usersFile, "utf8");
  const parsed = JSON.parse(raw || "[]");
  if (!Array.isArray(parsed)) return [];
  return parsed.map(normalizeUserProfile).filter(Boolean);
}

async function readJsonOwnerContext() {
  const raw = await readFile(ownerContextFile, "utf8");
  return normalizeOwnerContext(JSON.parse(raw || "{}"));
}

async function readJsonInteractionLogs() {
  try {
    const files = (await readdir(interactionLogsDir))
      .filter((file) => file.endsWith(".jsonl"))
      .sort();
    const entries = [];
    for (const file of files) {
      const raw = await readFile(path.join(interactionLogsDir, file), "utf8");
      for (const line of raw.split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
          entries.push(JSON.parse(line));
        } catch {
          // Ignore legacy malformed log lines.
        }
      }
    }
    return entries;
  } catch {
    return [];
  }
}

async function readJsonLearningSuggestions() {
  try {
    const raw = await readFile(learningSuggestionsFile, "utf8");
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function insertSqliteLearningSuggestion(suggestion) {
  if (!sqliteStorageReady) return;
  const payload = {
    id: suggestion.id || crypto.randomUUID(),
    createdAt: suggestion.createdAt || new Date().toISOString(),
    status: suggestion.status || "pending",
    reason: cleanNullable(suggestion.reason),
    businessContextAddition: cleanNullable(suggestion.businessContextAddition),
    interpretationRuleAddition: cleanNullable(suggestion.interpretationRuleAddition),
    sourceMessage: cleanNullable(suggestion.sourceMessage),
    workerName: cleanNullable(suggestion.workerName),
    workerPhone: cleanNullable(suggestion.workerPhone),
  };
  sqliteRun(
    `INSERT OR REPLACE INTO learning_suggestions (id, created_at, status, reason, business_context_addition, interpretation_rule_addition, source_message, worker_name, worker_phone, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [payload.id, payload.createdAt, payload.status, payload.reason, payload.businessContextAddition, payload.interpretationRuleAddition, payload.sourceMessage, payload.workerName, payload.workerPhone, JSON.stringify(payload)]
  );
}

function insertSqliteEvent(event) {
  if (!sqliteStorageReady) return;
  const normalized = normalizeStoredEvent(event);
  const createdAt = cleanNullable(event?.createdAt) || new Date().toISOString();
  const payload = {
    ...normalized,
    id: normalized.id || crypto.randomUUID(),
    createdAt,
  };

  sqliteRun(
    `INSERT OR REPLACE INTO events (
        id, worker_name, worker_phone, economic_label, economic_kind, execution_status,
        payment_status, derived_category, amount, currency, date, source_message, created_at,
        payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.id,
      payload.workerName,
      payload.workerPhone,
      payload.economicLabel,
      payload.economicKind,
      payload.executionStatus,
      payload.paymentStatus,
      payload.derivedCategory,
      payload.amount,
      payload.currency,
      payload.date,
      payload.sourceMessage,
      createdAt,
      JSON.stringify(payload)
    ]
  );
}

function insertSqliteUser(user) {
  if (!sqliteStorageReady) return;
  const normalized = normalizeUserProfile(user);
  if (!normalized) return;
  const now = new Date().toISOString();
  const payload = {
    ...normalized,
    createdAt: normalized.createdAt || now,
    updatedAt: normalized.updatedAt || now,
    lastSeenAt: normalized.lastSeenAt || now,
  };

  sqliteRun(
    `INSERT OR REPLACE INTO users (
        id, name, phone, source, created_at, updated_at, last_seen_at, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.id,
      payload.name,
      payload.phone,
      payload.source,
      payload.createdAt,
      payload.updatedAt,
      payload.lastSeenAt,
      JSON.stringify(payload)
    ]
  );
}

function insertSqliteOwnerContext(ownerContext) {
  if (!sqliteStorageReady) return;
  const payload = normalizeOwnerContext(ownerContext);
  sqliteRun(
    `INSERT OR REPLACE INTO owner_context (id, updated_at, payload_json) VALUES (1, ?, ?)`,
    [payload.updatedAt, JSON.stringify(payload)]
  );
}

function insertSqliteInteraction(entry) {
  if (!sqliteStorageReady) return;
  const payload = {
    ...entry,
    timestamp: cleanNullable(entry?.timestamp) || new Date().toISOString(),
  };
  const externalMessageId = normalizeExternalMessageId(
    payload.source,
    payload?.input?.externalMessageId || payload?.externalMessageId
  );
  const id =
    externalMessageId ||
    cleanNullable(payload.requestId) ||
    crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const savedEventIds = Array.isArray(payload?.output?.savedEventIds)
    ? payload.output.savedEventIds
    : [];

  sqliteRun(
      `INSERT OR REPLACE INTO interactions (
        id, timestamp, request_id, external_message_id, received_at, source, worker_name,
        worker_phone, message, is_complete, saved_event_ids, response_text, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      payload.timestamp,
      cleanNullable(payload.requestId),
      externalMessageId,
      cleanNullable(payload.receivedAt),
      cleanNullable(payload.source),
      cleanNullable(payload?.input?.workerName),
      normalizePhone(payload?.input?.workerPhone) || cleanNullable(payload?.input?.workerPhone),
      cleanNullable(payload?.input?.message),
      payload?.output?.isComplete ? 1 : 0,
      JSON.stringify(savedEventIds),
      cleanNullable(payload?.output?.workerFeedback || payload?.output?.clarificationMessage),
      JSON.stringify(payload)
    ]
  );
}

async function readEvents() {
  if (!sqliteStorageReady) return readJsonEvents();
  return sqliteAll("SELECT payload_json FROM events ORDER BY created_at DESC")
    .map((row) => normalizeStoredEvent(JSON.parse(row.payload_json)));
}

async function readUsers() {
  if (!sqliteStorageReady) return readJsonUsers();
  return sqliteAll("SELECT payload_json FROM users ORDER BY last_seen_at DESC")
    .map((row) => normalizeUserProfile(JSON.parse(row.payload_json)))
    .filter(Boolean);
}

async function readOwnerContext() {
  if (!sqliteStorageReady) return readJsonOwnerContext();
  const row = sqliteGet("SELECT payload_json FROM owner_context WHERE id = 1");
  return normalizeOwnerContext(row ? JSON.parse(row.payload_json) : defaultOwnerContext);
}

async function saveOwnerContext(input) {
  const ownerContext = {
    ...normalizeOwnerContext(input),
    updatedAt: new Date().toISOString(),
  };
  if (sqliteStorageReady) {
    insertSqliteOwnerContext(ownerContext);
  } else {
    await writeFile(ownerContextFile, JSON.stringify(ownerContext, null, 2), "utf8");
  }
  return ownerContext;
}

async function saveLearningSuggestion(suggestion, { workerName, workerPhone, sourceMessage } = {}) {
  if (!suggestion || (!suggestion.businessContextAddition && !suggestion.interpretationRuleAddition)) {
    return null;
  }

  const existingSuggestions = await readLearningSuggestions();
  const addKey = `${(suggestion.businessContextAddition || "").trim()}|${(suggestion.interpretationRuleAddition || "").trim()}`.toLowerCase();
  const duplicate = existingSuggestions.find((s) => {
    if (s.status !== "pending" && s.status !== "approved") return false;
    const existingKey = `${(s.businessContextAddition || "").trim()}|${(s.interpretationRuleAddition || "").trim()}`.toLowerCase();
    return existingKey === addKey;
  });

  if (duplicate) return null;

  const now = new Date().toISOString();
  const payload = {
    id: crypto.randomUUID(),
    createdAt: now,
    status: "pending",
    reason: cleanNullable(suggestion.reason) || null,
    businessContextAddition: cleanNullable(suggestion.businessContextAddition) || null,
    interpretationRuleAddition: cleanNullable(suggestion.interpretationRuleAddition) || null,
    sourceMessage: cleanNullable(sourceMessage) || null,
    workerName: cleanNullable(workerName) || null,
    workerPhone: cleanNullable(workerPhone) || null,
  };

  if (sqliteStorageReady) {
    sqliteRun(
      `INSERT INTO learning_suggestions (id, created_at, status, reason, business_context_addition, interpretation_rule_addition, source_message, worker_name, worker_phone, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [payload.id, payload.createdAt, payload.status, payload.reason, payload.businessContextAddition, payload.interpretationRuleAddition, payload.sourceMessage, payload.workerName, payload.workerPhone, JSON.stringify(payload)]
    );
  } else {
    existingSuggestions.unshift(payload);
    await writeFile(learningSuggestionsFile, JSON.stringify(existingSuggestions, null, 2), "utf8");
  }

  return payload;
}

async function readLearningSuggestions() {
  if (sqliteStorageReady) {
    return sqliteAll("SELECT payload_json FROM learning_suggestions ORDER BY created_at DESC")
      .map((row) => JSON.parse(row.payload_json));
  }
  try {
    const raw = await readFile(learningSuggestionsFile, "utf8");
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))) : [];
  } catch {
    return [];
  }
}

async function approveLearningSuggestion(id) {
  if (!id) return { ok: false, error: "Falta el identificador de la sugerencia.", status: 400 };

  const suggestions = await readLearningSuggestions();
  const suggestion = suggestions.find((s) => s.id === id);
  if (!suggestion) return { ok: false, error: "Sugerencia no encontrada.", status: 404 };
  if (suggestion.status !== "pending") return { ok: false, error: "Esta sugerencia ya fue procesada.", status: 400 };

  const ownerContext = await readOwnerContext();
  let updated = false;

  if (suggestion.businessContextAddition) {
    const current = ownerContext.businessContext || "";
    if (!current.toLowerCase().includes(suggestion.businessContextAddition.toLowerCase().trim())) {
      ownerContext.businessContext = current ? `${current}\n${suggestion.businessContextAddition}` : suggestion.businessContextAddition;
      updated = true;
    }
  }

  if (suggestion.interpretationRuleAddition) {
    const current = ownerContext.interpretationRules || "";
    if (!current.toLowerCase().includes(suggestion.interpretationRuleAddition.toLowerCase().trim())) {
      ownerContext.interpretationRules = current ? `${current}\n${suggestion.interpretationRuleAddition}` : suggestion.interpretationRuleAddition;
      updated = true;
    }
  }

  if (updated) {
    await saveOwnerContext(ownerContext);
  }

  const now = new Date().toISOString();
  const processedSuggestion = { ...suggestion, status: "approved", processedAt: now };
  if (sqliteStorageReady) {
    sqliteRun(
      "UPDATE learning_suggestions SET status = ?, payload_json = ? WHERE id = ?",
      ["approved", JSON.stringify(processedSuggestion), id]
    );
  } else {
    const idx = suggestions.findIndex((s) => s.id === id);
    if (idx >= 0) {
      suggestions[idx] = processedSuggestion;
      await writeFile(learningSuggestionsFile, JSON.stringify(suggestions, null, 2), "utf8");
    }
  }

  return {
    ok: true,
    suggestion: processedSuggestion,
    ownerContext: await readOwnerContext(),
    suggestions: await readLearningSuggestions(),
  };
}

async function rejectLearningSuggestion(id) {
  if (!id) return { ok: false, error: "Falta el identificador de la sugerencia.", status: 400 };

  const suggestions = await readLearningSuggestions();
  const suggestion = suggestions.find((s) => s.id === id);
  if (!suggestion) return { ok: false, error: "Sugerencia no encontrada.", status: 404 };
  if (suggestion.status !== "pending") return { ok: false, error: "Esta sugerencia ya fue procesada.", status: 400 };

  const processedSuggestion = { ...suggestion, status: "rejected", processedAt: new Date().toISOString() };
  if (sqliteStorageReady) {
    sqliteRun(
      "UPDATE learning_suggestions SET status = ?, payload_json = ? WHERE id = ?",
      ["rejected", JSON.stringify(processedSuggestion), id]
    );
  } else {
    const idx = suggestions.findIndex((s) => s.id === id);
    if (idx >= 0) {
      suggestions[idx] = processedSuggestion;
      await writeFile(learningSuggestionsFile, JSON.stringify(suggestions, null, 2), "utf8");
    }
  }

  return {
    ok: true,
    suggestion: processedSuggestion,
    suggestions: await readLearningSuggestions(),
  };
}

async function saveEvent(normalizedEvent) {
  const savedEvents = await saveEvents([normalizedEvent]);
  return savedEvents[0] || null;
}

async function saveEvents(normalizedEvents) {
  const savedEvents = normalizedEvents.map((normalizedEvent) => ({
    ...sanitizeNormalizedEvent(normalizedEvent),
    id: normalizedEvent.id || crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  }));

  if (sqliteStorageReady) {
    for (const event of savedEvents) insertSqliteEvent(event);
  } else {
    const events = await readEvents();
    events.unshift(...savedEvents);
    await writeFile(worksFile, JSON.stringify(events, null, 2), "utf8");
  }
  return savedEvents;
}

async function upsertUserProfile(input) {
  const phone = normalizePhone(input?.phone);
  if (!phone) return null;

  const users = await readUsers();
  const existing = users.find((user) => user.phone === phone);
  const now = new Date().toISOString();
  const nextUser = {
    id: existing?.id || crypto.randomUUID(),
    name: cleanNullable(input?.name) || existing?.name || null,
    phone,
    source: cleanNullable(input?.source) || existing?.source || "manual-ui",
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    lastSeenAt: now,
  };

  if (sqliteStorageReady) {
    insertSqliteUser(nextUser);
  } else {
    const nextUsers = [nextUser, ...users.filter((user) => user.phone !== phone)];
    await writeFile(usersFile, JSON.stringify(nextUsers, null, 2), "utf8");
  }
  return nextUser;
}

async function clearAllEvents() {
  if (sqliteStorageReady) {
    sqliteRun("DELETE FROM events");
  } else {
    await writeFile(worksFile, "[]", "utf8");
  }
  return [];
}

async function deleteEventById(eventId) {
  if (sqliteStorageReady) {
    sqliteRun("DELETE FROM events WHERE id = ?", [eventId]);
    return readEvents();
  }
  const events = await readEvents();
  const nextEvents = events.filter((event) => event.id !== eventId);
  await writeFile(worksFile, JSON.stringify(nextEvents, null, 2), "utf8");
  return nextEvents;
}

async function readInteractions({ limit = 100, phone = null } = {}) {
  if (!sqliteStorageReady) return [];
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const normalizedPhone = normalizePhone(phone);
  const rows = normalizedPhone
    ? sqliteAll(
        "SELECT payload_json FROM interactions WHERE worker_phone = ? ORDER BY timestamp DESC LIMIT ?",
        [normalizedPhone, safeLimit]
      )
    : sqliteAll("SELECT payload_json FROM interactions ORDER BY timestamp DESC LIMIT ?", [
        safeLimit,
      ]);

  return rows.map((row) => JSON.parse(row.payload_json));
}

async function findInteractionByExternalMessageId(externalMessageId) {
  if (!externalMessageId || !sqliteStorageReady) return null;
  const row = sqliteGet(
    "SELECT payload_json FROM interactions WHERE external_message_id = ? LIMIT 1",
    [externalMessageId]
  );
  return row ? JSON.parse(row.payload_json) : null;
}

async function findRecentSimilarIncomingMessage({ source, workerPhone, message, withinMinutes = 1440 }) {
  if (!sqliteStorageReady) return null;
  const phone = normalizePhone(workerPhone);
  const fingerprint = buildIncomingMessageFingerprint(message);
  if (!phone || !fingerprint) return null;

  const since = new Date(Date.now() - withinMinutes * 60 * 1000).toISOString();
  const rows = sqliteAll(
    `SELECT payload_json FROM interactions
      WHERE worker_phone = ?
        AND timestamp >= ?
        AND source = ?
      ORDER BY timestamp DESC
      LIMIT 80`,
    [phone, since, cleanNullable(source)]
  );

  for (const row of rows) {
    const interaction = JSON.parse(row.payload_json);
    const previousFingerprint = buildIncomingMessageFingerprint(interaction?.input?.message);
    if (previousFingerprint !== fingerprint) continue;
    const savedIds = interaction?.output?.savedEventIds || [];
    const answered = interaction?.output?.triiDelivery?.ok || interaction?.output?.workerFeedback;
    if (savedIds.length || answered) return interaction;
  }

  return null;
}

function findRecentSimilarSavedEvent({ events, message, withinMinutes = 1440 }) {
  const fingerprint = buildIncomingMessageFingerprint(message);
  if (!fingerprint) return null;
  const since = Date.now() - withinMinutes * 60 * 1000;

  return (Array.isArray(events) ? events : []).find((event) => {
    const createdAt = Date.parse(event.createdAt || event.date || "");
    if (Number.isFinite(createdAt) && createdAt < since) return false;
    const eventFingerprint = buildIncomingMessageFingerprint(
      event.sourceMessage || event.eventSummary || event.economicLabel
    );
    return eventFingerprint === fingerprint;
  }) || null;
}

function normalizeExternalMessageId(source, externalMessageId) {
  const id = cleanNullable(externalMessageId);
  if (!id) return null;
  const cleanSource = cleanNullable(source) || "unknown";
  if (id.startsWith(`${cleanSource}:`)) return id;
  return `${cleanSource}:${id}`;
}

function isWebhookSource(source) {
  return ["meta-webhook", "trii-webhook"].includes(cleanNullable(source));
}

function getInteractionInput(interaction) {
  return interaction?.input || {
    workerName: interaction?.worker_name || interaction?.workerName,
    workerPhone: interaction?.worker_phone || interaction?.workerPhone,
    message: interaction?.user_message || interaction?.message,
  };
}

function hasIncompleteEconomicOutput(interaction) {
  const output = interaction?.output || {};
  const missing = Array.isArray(output.missingFields) ? output.missingFields : [];
  const savedIds = Array.isArray(output.savedEventIds) ? output.savedEventIds : [];
  return missing.length > 0 && !output.savedEventId && savedIds.length === 0 && !output.historyQuery;
}

function looksLikeConversationContinuation(message) {
  const text = String(message || "").trim();
  if (!text) return false;
  if (isExplicitContinuationMessage(text)) return true;
  if (looksLikeStandaloneEconomicEvent(text)) return false;
  return /\b(fue en|en barrio|zona|cobr[eé]|cobr[oó]|me pagaron|ya me pagaron|transferencia|efectivo|mercado\s*pago|queda pendiente|pendiente de cobro|son\s+\d|por\s+\d|\$\s*\d|\d+\s*(todo|pesos|ars))\b/i.test(text);
}

function isExplicitContinuationMessage(message) {
  return /^(parte\s*\d+|tamb[ié]n|adem[aá]s|y\s+|ahora\s+|despu[eé]s\s+|perd[oó]n|correcci[oó]n|lo anterior|de ese|para ese)/i.test(
    String(message || "").trim()
  );
}

function looksLikeStandaloneEconomicEvent(message) {
  const text = String(message || "").trim();
  if (!text) return false;
  const startsAsNewEvent =
    /^(hice|realic[eé]|vend[ií]|vendo|vendimos|entregu[eé]|cerr[eé]|arregl[eé]|instal[eé]|repar[eé]|cambi[eé]|pint[eé]|limpi[eé]|prest[eé]|necesito cargar|cargar|registrar|anot[aá]|anotar|tengo que cargar|tengo para cargar)\b/i.test(text);
  const hasStandaloneAmount =
    /\$\s*\d|\b\d{4,9}(?:[.,]\d{1,2})?\b|\b\d+\s*(?:pesos|ars|mil|lucas|k|todo|total)\b/i.test(text);
  const hasEconomicSignal = Boolean(
    parseEconomicKind(text) ||
      parseCategory(text) ||
      hasStandaloneAmount
  );
  return startsAsNewEvent && hasEconomicSignal;
}

async function buildMessageWithConversationContext({ source, workerPhone, message }) {
  const originalMessage = String(message || "").trim();
  const phone = normalizePhone(workerPhone);
  const shouldUseContext = isWebhookSource(source) || looksLikeConversationContinuation(originalMessage);

  if (!phone || !originalMessage || !shouldUseContext || !looksLikeConversationContinuation(originalMessage)) {
    return {
      message: originalMessage,
      used: false,
      previousMessages: [],
    };
  }

  const interactions = await readInteractions({ limit: 40, phone });
  const recentIncomplete = interactions
    .map((interaction) => ({ interaction, input: getInteractionInput(interaction) }))
    .filter(({ input }) => normalizePhone(input?.workerPhone) === phone && cleanNullable(input?.message))
    .filter(({ interaction }) => hasIncompleteEconomicOutput(interaction))
    .slice(0, 3)
    .reverse();

  if (!recentIncomplete.length) {
    return {
      message: originalMessage,
      used: false,
      previousMessages: [],
    };
  }

  const previousMessages = recentIncomplete
    .map(({ input }) => cleanNullable(input.message))
    .filter(Boolean);
  const parts = previousMessages
    .flatMap((part) => String(part).split(/\n+/))
    .map((part) => part.trim())
    .filter(Boolean);
  const uniqueParts = Array.from(new Set(parts));
  if (uniqueParts.includes(originalMessage)) {
    return {
      message: originalMessage,
      used: false,
      previousMessages,
    };
  }

  return {
    message: [...uniqueParts, originalMessage].join("\n"),
    used: true,
    previousMessages,
  };
}

function buildIncomingMessageFingerprint(message) {
  const key = normalizeTextKey(message)
    .replace(/\b(lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo)\b/g, " ")
    .replace(/\b\d{1,2}\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/g, " ")
    .replace(/\b(20\d{2})\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return key || null;
}

function buildDuplicateWebhookResponse({
  requestId,
  receivedAt,
  source,
  externalMessageId,
  previousInteraction,
  reason = "duplicate-webhook-message",
}) {
  const output = previousInteraction?.output || {};
  const input = previousInteraction?.input || {};
  return {
    ok: true,
    duplicate: true,
    requestId,
    receivedAt,
    source,
    externalMessageId,
    originalRequestId: previousInteraction?.requestId || null,
    message: "Mensaje duplicado ya procesado. No se vuelve a registrar ni responder.",
    normalizedEvent: output.normalizedEvent || null,
    normalizedEvents: output.normalizedEvents || [],
    normalizedWork: output.normalizedEvent || null,
    savedEvent: null,
    savedEvents: [],
    savedWork: null,
    savedEventIds: output.savedEventIds || [],
    workerFeedback: output.workerFeedback || null,
    clarificationMessage: output.clarificationMessage || null,
    isComplete: Boolean(output.isComplete),
    missingFields: output.missingFields || [],
    tracking: output.tracking || null,
    input,
    triiDelivery: {
      ok: true,
      skipped: true,
      reason,
    },
  };
}

function buildDuplicateSavedEventResponse({
  requestId,
  receivedAt,
  source,
  externalMessageId,
  workerName,
  workerPhone,
  message,
  savedEvent,
}) {
  const answer = `Ya tenía registrado este mismo evento: "${savedEvent.economicLabel || "evento"}" por ${formatCurrency(savedEvent.amount || 0)}${savedEvent.date ? ` con fecha ${savedEvent.date}` : ""}. No lo vuelvo a duplicar.`;
  return {
    ok: true,
    duplicate: true,
    requestId,
    receivedAt,
    source,
    externalMessageId,
    message: "Evento duplicado ya registrado. No se vuelve a registrar ni responder.",
    normalizedEvent: savedEvent,
    normalizedEvents: [savedEvent],
    normalizedWork: savedEvent,
    savedEvent,
    savedEvents: [savedEvent],
    savedWork: savedEvent,
    savedEventIds: [savedEvent.id].filter(Boolean),
    workerFeedback: answer,
    clarificationMessage: null,
    isComplete: true,
    missingFields: [],
    tracking: null,
    input: {
      workerName,
      workerPhone,
      message,
    },
    triiDelivery: {
      ok: true,
      skipped: true,
      reason: "duplicate-existing-event-window",
    },
  };
}

async function buildMetrics() {
  return buildMetricsFromEvents(await readEvents());
}

function buildMetricsFromEvents(events) {
  const realizedEvents = events.filter((event) => event.executionStatus === "realizado");
  const pendingEvents = events.filter((event) => event.executionStatus === "pendiente");
  const collectedEvents = events.filter((event) => event.paymentStatus === "cobrado");
  const serviceEvents = events.filter((event) => event.economicKind === "servicio");
  const productEvents = events.filter((event) => event.economicKind === "producto");
  const totalCollected = collectedEvents.reduce((sum, event) => sum + (Number(event.amount) || 0), 0);

  const categories = events.reduce((acc, event) => {
    const key = event.derivedCategory || event.economicKind || event.economicLabel || "Sin clasificar";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const monthlyCollected = collectedEvents.reduce((acc, event) => {
    const month = event.date ? event.date.slice(0, 7) : "Sin fecha";
    acc[month] = (acc[month] || 0) + (Number(event.amount) || 0);
    return acc;
  }, {});

  return {
    totalEvents: events.length,
    serviceEvents: serviceEvents.length,
    productEvents: productEvents.length,
    realizedEvents: realizedEvents.length,
    pendingEvents: pendingEvents.length,
    collectedEvents: collectedEvents.length,
    pendingCollectionEvents: events.filter((event) => event.paymentStatus !== "cobrado").length,
    totalCollected,
    averageTicket: collectedEvents.length ? totalCollected / collectedEvents.length : 0,
    topCategories: Object.entries(categories)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count })),
    monthlyCollected: Object.entries(monthlyCollected)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, value]) => ({ month, value })),
    totalWorks: events.length,
    realizedWorks: realizedEvents.length,
    pendingWorks: pendingEvents.length,
    totalIncome: totalCollected,
    monthlyIncome: Object.entries(monthlyCollected)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, value]) => ({ month, value })),
  };
}

function parseAmount(message) {
  const moneyToken = String.raw`\$?\s*(?:\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,3})?)\s*(?:mil|lucas|k)?`;
  const explicitMoneyMatch =
    message.match(
      new RegExp(String.raw`(?:cobr[ée]|cobramos|por|monto|precio|pag[oó]|pagaron|me pagaron|vend[ií].*?por|sale|cotiz\w*|presupuest\w*|adelantaron|pas[eé])\s*(?:de\s*)?(${moneyToken})`, "i")
    ) ||
    message.match(new RegExp(String.raw`(${moneyToken})\s*(?:pesos|ars|mil|lucas|k)\b`, "i")) ||
    message.match(new RegExp(String.raw`(?:^|\n|\b)(${moneyToken})\s*(?:todo|total)\b`, "i")) ||
    message.match(new RegExp(String.raw`(\$\s*(?:\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,3})?))`, "i"));
  if (!explicitMoneyMatch) return parseStandaloneEconomicAmount(message);
  return parseMoneyValue(explicitMoneyMatch[1])?.amount ?? null;
}

function parseStandaloneEconomicAmount(message) {
  const text = String(message || "");
  if (!looksLikeStandaloneEconomicEvent(text)) return null;
  const matches = [...text.matchAll(/\b(\d{4,9})(?:[.,]\d{1,2})?\b/g)]
    .map((match) => match[0])
    .filter((value) => !/^20\d{2}$/.test(value));
  if (matches.length !== 1) return null;
  return parseMoneyValue(matches[0])?.amount ?? null;
}

function parseMoneyInfo(message) {
  const moneyToken = String.raw`\$?\s*(?:\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,3})?)\s*(?:mil|lucas|k)?`;
  const match =
    String(message || "").match(
      new RegExp(String.raw`(?:cobr[ée]|cobramos|por|monto|precio|pag[oó]|pagaron|me pagaron|vend[ií].*?por|sale|cotiz\w*|presupuest\w*|adelantaron|pas[eé])\s*(?:de\s*)?(${moneyToken})`, "i")
    ) ||
    String(message || "").match(new RegExp(String.raw`(?:^|\n|\b)(${moneyToken})\s*(?:todo|total)\b`, "i")) ||
    String(message || "").match(new RegExp(String.raw`(\$\s*(?:\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,3})?))`, "i"));
  if (!match) return null;
  return parseMoneyValue(match[1]);
}

function parseMoneyAfterQuoteWord(message) {
  const moneyToken = String.raw`\$?\s*(?:\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,3})?)\s*(?:mil|lucas|k)?`;
  const match = String(message || "").match(
    new RegExp(String.raw`\b(?:cotiz|presupuest)[A-Za-zÁÉÍÓÚáéíóúñÑ]*\s+(${moneyToken})`, "i")
  );
  return match?.[1] ? parseMoneyValue(match[1])?.amount ?? null : null;
}

function parseMoneyValue(value) {
  const raw = cleanNullable(value);
  if (!raw) return null;
  const multiplier = /\b(mil|lucas|k)\b/i.test(raw) ? 1000 : 1;
  const numericPart = raw.replace(/\$/g, "").replace(/\b(mil|lucas|k|pesos|ars)\b/gi, "").trim();
  const compact = numericPart.replace(/\s/g, "");
  const hasDot = compact.includes(".");
  const hasComma = compact.includes(",");
  let normalized = compact;
  let note = null;

  if (hasDot && hasComma) {
    const lastDot = compact.lastIndexOf(".");
    const lastComma = compact.lastIndexOf(",");
    const decimalSeparator = lastDot > lastComma ? "." : ",";
    const thousandsSeparator = decimalSeparator === "." ? "," : ".";
    normalized = compact.replaceAll(thousandsSeparator, "").replace(decimalSeparator, ".");
    note = "Monto leído con separadores mixtos; conviene revisar si el formato vino cargado a mano.";
  } else if (hasComma || hasDot) {
    const separator = hasComma ? "," : ".";
    const parts = compact.split(separator);
    const last = parts.at(-1) || "";
    if (parts.length > 2 || last.length === 3) {
      normalized = compact.replaceAll(separator, "");
      note = `Monto leído como miles usando "${separator}".`;
    } else {
      normalized = compact.replace(separator, ".");
      if (last.length > 0 && last.length <= 2 && Number(`0.${last}`) > 0) {
        note = `Monto leído con "${separator}" como decimal.`;
      }
    }
  }

  const amount = Number(normalized) * multiplier;
  return Number.isFinite(amount) ? { amount, note } : null;
}

function parseDate(message) {
  const iso = message.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];

  if (/\bhoy\b/i.test(message)) return new Date().toISOString().slice(0, 10);
  if (/\bayer\b/i.test(message)) {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return date.toISOString().slice(0, 10);
  }
  if (/\bmañana\b/i.test(message)) {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return date.toISOString().slice(0, 10);
  }

  if (/\b(hoy|arregl[eé]|cobr[eé]|vend[ií]|hice|realic[eé]|di|estuve|fui|presupuest[eé]|decor[eé]|cambi[eé]|instal[eé])\b/i.test(message)) {
    return new Date().toISOString().slice(0, 10);
  }

  const slash = message.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (slash) {
    const day = slash[1].padStart(2, "0");
    const month = slash[2].padStart(2, "0");
    const year = slash[3] ? slash[3].padStart(4, "20") : String(new Date().getFullYear());
    return `${year}-${month}-${day}`;
  }

  return null;
}

function parseCategory(message) {
  const catalog = [
    ["plomería", ["plomer", "caño", "canilla", "sanitari"]],
    ["electricidad", ["electric", "tablero", "disyuntor", "luz"]],
    ["albañilería", ["albañ", "pared", "revoque", "mamposter"]],
    ["clase", ["clase", "curso", "enseñ", "alumno"]],
    ["sesión", ["sesión", "consulta", "atención"]],
    ["limpieza", ["limpieza", "limpié", "aseo"]],
    ["instalación", ["instal", "montaje", "coloc"]],
    ["reparación", ["repar", "arreglo", "arreglé"]],
    ["venta", ["vend", "venta", "stock", "mercadería", "producto", "aceite", "lente", "auto"]],
  ];

  const lower = message.toLowerCase();
  for (const [label, keywords] of catalog) {
    if (keywords.some((keyword) => lower.includes(keyword))) {
      return label;
    }
  }

  return null;
}

function parseEconomicKind(message) {
  const lower = String(message || "").toLowerCase();
  if (!lower) return null;

  if (
    /\b(vend[ií]|vendo|venta|stock|producto|mercader[ií]a|aceite|lente|lentes|auto|repuesto|entregu[eé])\b/i.test(
      lower
    )
  ) {
    return "producto";
  }

  if (
    /\b(servicio|arregl[eé]|instal[eé]|repar[eé]|limpi[eé]|clase|consulta|atenci[oó]n|trabaj|pintur|mantenimiento|decor[eé]|service|humedad|pirca|mudanza)\b/i.test(
      lower
    )
  ) {
    return "servicio";
  }

  return null;
}

function parseEconomicLabel(message, economicKind, derivedCategory) {
  const patterns = [
    /(?:cotic[eé]|cotiz[oó]|presupuest[eé]|pas[eé]\s+presupuesto)\s+(.*?)(?:,|\.| por| y|$)/i,
    /(?:venta\s+de)\s+(.*?)(?:,?\s+\d+\s*(?:botellas?|unidades?|u\.?)|,|\.| por\s+\d| y cobré| y me pagaron|\n|$)/i,
    /(?:vend[ií]|vendo|vendimos|entregu[eé]|cerr[eé])\s+(.*?)(?:,|\.| por\s+\d| y cobré| y me pagaron|$)/i,
    /(?:hice|realic[eé]|arregl[eé]|cambi[eé]|instal[eé]|pint[eé]|limpi[eé]|prest[eé])\s+(.*?)(?:,|\.| por\s+\$?\d| y cobré| y me pagaron|$)/i,
    /(?:levantando|levant[eé])\s+(.*?)(?:,|\.| cobr[eé]|$)/i,
    /(?:adelantaron|me\s+adelantaron|recib[ií]\s+anticipo)\s+.*?\s+para\s+(.*?)(?:,|\.| que|$)/i,
    /(?:tengo|voy a hacer|mañana hago|har[eé]|mañana tengo)\s+(.*?)(?:,|\.| y|$)/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      return match[1].trim().replace(/[.]+$/, "");
    }
  }

  if (derivedCategory && economicKind === "producto") {
    return `Venta de ${derivedCategory}`;
  }

  if (derivedCategory && economicKind === "servicio") {
    return `Servicio de ${derivedCategory}`;
  }

  return null;
}

function parseExecutionStatus(message) {
  if (/\b(cotic[eé]|cotizaci[oó]n|presupuesto|voy a|mañana|pendiente|tengo que|har[eé]|a realizar|por hacer|después|si acepta)\b/i.test(message)) {
    return "pendiente";
  }
  return "realizado";
}

function parsePaymentStatus(message, executionStatus, amount) {
  if (
    /\b(no me pagaron|no cobr[eé]|me deben|a cobrar|pendiente de cobro|despu[eé]s me pagan|falta cobrar)\b/i.test(
      message
    )
  ) {
    return "pendiente_cobro";
  }

  if (/\b(cobr[ée]|me pagaron|cobrado|transferencia|efectivo|ya pag[oó]|señ[aá])\b/i.test(message)) {
    return "cobrado";
  }

  if (executionStatus === "pendiente") {
    return "pendiente_cobro";
  }

  if (executionStatus === "realizado" && amount !== null) {
    return null;
  }

  return null;
}

function parseLocation(message) {
  const match = message.match(/(?:en|zona|barrio)\s+([A-Za-zÁÉÍÓÚáéíóúñÑ0-9\s]+?)(?=\s+(?:por|y|con|ya|despu[eé]s|para)\b|[.,;]|$)/i);
  return match ? match[1].trim().replace(/[.,;]+$/, "") : null;
}

function parseEvidence(message) {
  if (/transferencia|comprobante/i.test(message)) {
    return "comprobante_pago";
  }
  if (/imagen|foto/i.test(message)) {
    return "foto";
  }
  if (/audio/i.test(message)) {
    return "audio";
  }
  if (/factura/i.test(message)) {
    return "factura";
  }
  return null;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function extractJson(raw) {
  const clean = raw.trim();
  try {
    return JSON.parse(clean);
  } catch {
    const fenced = clean.match(/```json\s*([\s\S]*?)```/i) || clean.match(/```([\s\S]*?)```/i);
    if (fenced) return JSON.parse(fenced[1]);
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(clean.slice(start, end + 1));
    }
    throw new Error("No se pudo extraer JSON de la respuesta del modelo.");
  }
}

function extractModelContent(raw, { stripThink = true } = {}) {
  try {
    const parsed = JSON.parse(raw);
    const content = parsed?.choices?.[0]?.message?.content;
    if (typeof content === "string" && content.trim()) {
      return stripThink ? stripThinkTags(content) : content.trim();
    }
  } catch {
    // If it is not a JSON envelope, use raw content as-is.
  }

  return stripThink ? stripThinkTags(raw) : raw;
}

function stripThinkTags(content) {
  return String(content || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function buildReasoningLogEntry(analysis) {
  return {
    llm: analysis.llm,
    reasoningTrace: analysis.reasoningTrace || {
      mode: analysis?.llm?.mode || "unknown",
    },
  };
}

async function logInteraction(entry) {
  const timestamp = cleanNullable(entry?.timestamp) || new Date().toISOString();
  const payload = {
    ...entry,
    timestamp,
  };
  insertSqliteInteraction(payload);
  const filePath = path.join(interactionLogsDir, `${timestamp.slice(0, 10)}.jsonl`);
  await appendJsonLine(filePath, payload);
}

async function logServerError(entry) {
  await appendJsonLine(serverErrorsLogFile, {
    timestamp: new Date().toISOString(),
    ...entry,
  });
}

async function appendJsonLine(filePath, payload) {
  try {
    await appendFile(filePath, `${JSON.stringify(payload)}\n`, "utf8");
  } catch (error) {
    console.error("Log append error:", error);
  }
}

function serializeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack || null,
    };
  }
  return {
    message: String(error),
  };
}

function getTriiMode() {
  if (envConfig.metaAccessToken && envConfig.metaPhoneNumberId) return "meta";
  if (envConfig.triiApiKey && envConfig.triiChannelId) return "v2";
  if (envConfig.triiToken && envConfig.triiIdCanal && envConfig.triiEndpoint) return "v1";
  return "disabled";
}

function buildTriiStatus() {
  const mode = getTriiMode();
  const providerLabel =
    mode === "meta" ? "Meta Cloud API" : mode === "disabled" ? "WhatsApp" : "Triii";
  return {
    configured: mode !== "disabled",
    mode,
    provider: mode === "meta" ? "meta" : mode === "disabled" ? "disabled" : "trii",
    providerLabel,
    endpoint:
      mode === "meta"
        ? `https://graph.facebook.com/${envConfig.metaGraphVersion}/${envConfig.metaPhoneNumberId}/messages`
        : mode === "v2"
          ? envConfig.triiV2Endpoint
          : envConfig.triiEndpoint,
    idCanal: envConfig.triiIdCanal,
    channelId: envConfig.triiChannelId,
    phoneNumberId: envConfig.metaPhoneNumberId,
    wabaId: envConfig.metaWabaId,
    hasHeaderApiKey: Boolean(envConfig.triiApiKeyHeader || envConfig.triiApiKey),
    hasAccessToken: Boolean(envConfig.metaAccessToken),
  };
}

async function sendViaTrii({ phone, text, context, template }) {
  const mode = getTriiMode();
  if (mode === "disabled") {
    return {
      ok: false,
      mode: "disabled",
      provider: "disabled",
      providerLabel: "WhatsApp",
      context,
      note: "WhatsApp no está configurado en variables de entorno.",
    };
  }

  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    return {
      ok: false,
      mode: "disabled",
      provider: "disabled",
      providerLabel: "WhatsApp",
      context,
      note: "No hay teléfono válido para enviar por WhatsApp.",
    };
  }

  if (mode === "meta") {
    return sendViaMeta({ phone: normalizedPhone, text, context, template });
  }

  if (mode === "v2") {
    return sendViaTriiV2({ phone: normalizedPhone, text, context, template });
  }

  return sendViaTriiV1({ phone: normalizedPhone, text, context });
}

async function sendViaTriiV2({ phone, text, context, template }) {
  const headers = {
    "Content-Type": "application/json",
    "TRII-API-KEY": envConfig.triiApiKey,
  };

  const body = {
    channelId: envConfig.triiChannelId,
    whatsapp: template
      ? {
          to: phone,
          type: "TEMPLATE",
          template: {
            name: template.name,
            headerVars: template.headerVars || [],
            bodyVars: template.bodyVars || [],
            buttonVars: template.buttonVars || [],
          },
        }
      : {
          to: phone,
          type: "TEXT",
          message: String(text || "").trim(),
        },
  };

  const response = await fetch(envConfig.triiV2Endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const responseText = await response.text();
  return {
    ok: response.ok,
    provider: "trii",
    providerLabel: "Triii",
    mode: "v2",
    context,
    phone,
    status: response.status,
    statusText: response.statusText,
    body: responseText,
  };
}

async function sendViaTriiV1({ phone, text, context }) {
  const headers = { "Content-Type": "application/json" };
  if (envConfig.triiApiKeyHeader) {
    headers["TRII-API-KEY"] = envConfig.triiApiKeyHeader;
  }

  const body = {
    token: envConfig.triiToken,
    idCanal: envConfig.triiIdCanal,
    whatsapp: {
      tipo: "texto",
      para: phone,
      mensaje: String(text || "").trim(),
    },
  };

  const response = await fetch(envConfig.triiEndpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const responseText = await response.text();
  return {
    ok: response.ok,
    provider: "trii",
    providerLabel: "Triii",
    mode: "v1",
    context,
    phone,
    status: response.status,
    statusText: response.statusText,
    body: responseText,
  };
}

async function sendViaMeta({ phone, text, context, template }) {
  const headers = {
    Authorization: `Bearer ${envConfig.metaAccessToken}`,
    "Content-Type": "application/json",
  };

  const body = template
    ? {
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: template.name,
          language: { code: template.languageCode || "es_AR" },
          ...(Array.isArray(template.bodyVars) && template.bodyVars.length
            ? {
                components: [
                  {
                    type: "body",
                    parameters: template.bodyVars.map((value) => ({
                      type: "text",
                      text: String(value ?? ""),
                    })),
                  },
                ],
              }
            : {}),
        },
      }
    : {
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: {
          body: String(text || "").trim(),
        },
      };

  const response = await fetch(
    `https://graph.facebook.com/${envConfig.metaGraphVersion}/${envConfig.metaPhoneNumberId}/messages`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }
  );

  const responseText = await response.text();
  let parsedBody = null;
  try {
    parsedBody = JSON.parse(responseText);
  } catch {}

  return {
    ok: response.ok,
    provider: "meta",
    providerLabel: "Meta Cloud API",
    mode: "meta",
    context,
    phone,
    status: response.status,
    statusText: response.statusText,
    endpoint: `/${envConfig.metaGraphVersion}/${envConfig.metaPhoneNumberId}/messages`,
    body: responseText,
    parsedBody,
    messageId: parsedBody?.messages?.[0]?.id || null,
  };
}

async function buildCsvExport() {
  const events = await readEvents();
  const headers = [
    "id",
    "workerName",
    "workerPhone",
    "economicLabel",
    "economicKind",
    "executionStatus",
    "paymentStatus",
    "amount",
    "currency",
    "date",
    "broadArea",
    "derivedCategory",
    "evidenceType",
    "commercialStatus",
    "quotedAmount",
    "startDate",
    "endDate",
    "estimatedDuration",
    "collaborators",
    "splitRule",
    "netIncome",
    "grossAmount",
    "costAmount",
    "costDescription",
    "deductionAmount",
    "deductionDescription",
    "quantity",
    "unit",
    "moneyParsingNote",
    "eventSummary",
    "sourceMessage",
    "createdAt",
  ];

  const rows = events.map((event) =>
    headers.map((header) => escapeCsv(csvCellValue(event[header]))).join(",")
  );

  return `\uFEFF${headers.join(",")}\n${rows.join("\n")}`;
}

function csvCellValue(value) {
  if (Array.isArray(value)) return value.join("; ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return value ?? "";
}

function escapeCsv(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function extractIncomingTriiMessage(payload) {
  const msgIm = payload?.msg_im || payload?.msgIm || payload?.whatsapp || {};
  const workerPhone =
    cleanNullable(
      payload?.workerPhone ||
        payload?.from ||
        payload?.numero ||
        payload?.telefono ||
        msgIm?.de ||
        msgIm?.from ||
        payload?.whatsapp?.from ||
        payload?.whatsapp?.de ||
        payload?.whatsapp?.para ||
        payload?.event?.from ||
        payload?.contact?.phone
    ) || null;

  const workerName =
    cleanNullable(
      payload?.workerName ||
        payload?.name ||
        payload?.deMostrarComo ||
        payload?.contact?.name ||
        payload?.pushName ||
        payload?.event?.name
    ) || null;

  const message =
    cleanNullable(
      payload?.message ||
        payload?.texto ||
        payload?.text ||
        msgIm?.text ||
        msgIm?.mensaje ||
        payload?.whatsapp?.mensaje ||
        payload?.whatsapp?.text ||
        payload?.event?.message ||
        payload?.event?.text
    ) || "";

  return {
    workerName,
    workerPhone: normalizeTriiPhone(workerPhone),
    message,
    direction: cleanNullable(payload?.Direction || payload?.direction) || null,
    channel: cleanNullable(payload?.canal || payload?.channel) || null,
    triiMessageId: cleanNullable(payload?.idMsg || payload?.guid) || null,
    raw: payload,
  };
}

function extractIncomingMetaMessages(payload) {
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  const messages = [];
  const statuses = [];
  const metadata = [];

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];

    for (const change of changes) {
      const value = change?.value || {};
      const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
      const contact = contacts[0] || {};
      const phoneMetadata = value?.metadata || {};
      const batchMessages = Array.isArray(value?.messages) ? value.messages : [];
      const batchStatuses = Array.isArray(value?.statuses) ? value.statuses : [];

      if (phoneMetadata?.phone_number_id || phoneMetadata?.display_phone_number) {
        metadata.push({
          phoneNumberId: cleanNullable(phoneMetadata.phone_number_id) || null,
          displayPhoneNumber: cleanNullable(phoneMetadata.display_phone_number) || null,
        });
      }

      for (const status of batchStatuses) {
        statuses.push({
          id: cleanNullable(status?.id) || null,
          status: cleanNullable(status?.status) || null,
          recipientId: cleanNullable(status?.recipient_id) || null,
          timestamp: cleanNullable(status?.timestamp) || null,
          conversationId: cleanNullable(status?.conversation?.id) || null,
          category: cleanNullable(status?.conversation?.origin?.type) || null,
          pricingCategory: cleanNullable(status?.pricing?.category) || null,
          raw: status,
        });
      }

      for (const message of batchMessages) {
        const workerPhone =
          normalizePhone(message?.from) ||
          normalizePhone(contact?.wa_id) ||
          normalizePhone(contact?.input) ||
          null;
        const workerName =
          cleanNullable(contact?.profile?.name) ||
          cleanNullable(message?.profile?.name) ||
          null;
        const normalizedMessage = extractMetaMessageText(message);

        if (!workerPhone || !normalizedMessage) continue;

        messages.push({
          workerName,
          workerPhone,
          message: normalizedMessage,
          type: cleanNullable(message?.type) || "text",
          metaMessageId: cleanNullable(message?.id) || null,
          timestamp: cleanNullable(message?.timestamp) || null,
          raw: message,
        });
      }
    }
  }

  return {
    object: cleanNullable(payload?.object) || null,
    metadata,
    messages,
    statuses,
    raw: payload,
  };
}

function extractMetaMessageText(message) {
  const type = cleanNullable(message?.type) || "";

  if (type === "text") {
    return cleanNullable(message?.text?.body) || "";
  }

  if (type === "button") {
    return cleanNullable(message?.button?.text) || cleanNullable(message?.button?.payload) || "";
  }

  if (type === "interactive") {
    return (
      cleanNullable(message?.interactive?.button_reply?.title) ||
      cleanNullable(message?.interactive?.button_reply?.id) ||
      cleanNullable(message?.interactive?.list_reply?.title) ||
      cleanNullable(message?.interactive?.list_reply?.description) ||
      cleanNullable(message?.interactive?.list_reply?.id) ||
      ""
    );
  }

  if (type === "image" || type === "video" || type === "document") {
    return cleanNullable(message?.[type]?.caption) || `[${type}]`;
  }

  if (type === "audio") {
    return "[audio]";
  }

  return cleanNullable(message?.text?.body) || "";
}

function normalizeTriiPhone(value) {
  const cleaned = cleanNullable(value);
  if (!cleaned) return null;
  return cleaned
    .replace(/@whatsapp\.c$/i, "")
    .replace(/@c\.us$/i, "")
    .replace(/@s\.whatsapp\.net$/i, "");
}

function normalizePhone(value) {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("549")) return digits;
  if (digits.startsWith("54")) return `549${digits.slice(2)}`;
  if (digits.startsWith("9")) return `54${digits}`;
  return `549${digits}`;
}

function sendEmpty(res, statusCode) {
  res.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,TRII-API-KEY",
  });
  res.end();
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,TRII-API-KEY",
  });
  res.end(JSON.stringify(payload));
}

function isPublicRequest(req, url) {
  if (req.method === "GET" && url.pathname === "/favicon.ico") return true;
  if (url.pathname === "/api/meta/webhook") return true;
  if (req.method === "POST" && url.pathname === "/api/trii/webhook") return true;
  return false;
}

function isAuthenticated(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies[authConfig.cookieName];
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const payload = parts[0];
  const signature = parts[1];
  const expected = signSessionPayload(payload);
  if (!safeEqual(signature, expected)) return false;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return session.user === authConfig.username && Number(session.exp) > Date.now();
  } catch {
    return false;
  }
}

async function handleLogin(req, res) {
  const raw = await readBodyText(req);
  const params = new URLSearchParams(raw);
  const username = String(params.get("username") || "").trim();
  const password = String(params.get("password") || "");

  if (username !== authConfig.username || !verifyPassword(password)) {
    return redirect(res, "/login?error=1");
  }

  const token = createSessionToken(username);
  res.writeHead(303, {
    Location: "/",
    "Set-Cookie": buildCookie(token),
    "Cache-Control": "no-store",
  });
  res.end();
}

function handleLogout(res) {
  res.writeHead(303, {
    Location: "/login",
    "Set-Cookie": `${authConfig.cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
    "Cache-Control": "no-store",
  });
  res.end();
}

function verifyPassword(password) {
  const hash = crypto.scryptSync(password, authConfig.passwordSalt, 64).toString("hex");
  return safeEqual(hash, authConfig.passwordHash);
}

function createSessionToken(username) {
  const payload = Buffer.from(
    JSON.stringify({
      user: username,
      iat: Date.now(),
      exp: Date.now() + authConfig.maxAgeSeconds * 1000,
    }),
    "utf8"
  ).toString("base64url");
  return `${payload}.${signSessionPayload(payload)}`;
}

function signSessionPayload(payload) {
  return crypto.createHmac("sha256", authConfig.sessionSecret).update(payload).digest("base64url");
}

function buildCookie(token) {
  const secure = process.env.AUTH_COOKIE_SECURE === "false" ? "" : "; Secure";
  return `${authConfig.cookieName}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${authConfig.maxAgeSeconds}${secure}`;
}

function parseCookies(header) {
  return Object.fromEntries(
    String(header || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index < 0) return [part, ""];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function redirect(res, location) {
  res.writeHead(303, {
    Location: location,
    "Cache-Control": "no-store",
  });
  res.end();
}

function sendLoginPage(res, error) {
  const errorBlock = error ? '<p class="error">Usuario o contraseña incorrectos.</p>' : "";
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(`<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Ingreso TECO</title>
    <style>
      :root{--bg:#faf9f6;--panel:#fff;--text:#111827;--muted:#64748b;--brand-green:#3d8b37;--brand-orange:#d17a2a;--border:#e8e4df;--danger:#b91c1c}
      *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--text)}
      .card{width:min(420px,calc(100vw - 32px));background:var(--panel);border:1px solid var(--border);border-radius:22px;padding:28px;box-shadow:0 24px 60px rgba(15,23,42,.10)}
      h1{margin:0;color:var(--brand-green);font-size:1.55rem;letter-spacing:.02em}p{margin:8px 0 22px;color:var(--muted);line-height:1.45}
      label{display:grid;gap:7px;margin-bottom:14px;font-weight:700;font-size:.86rem}input{width:100%;border:1px solid var(--border);border-radius:12px;padding:13px 14px;font:inherit}
      button{width:100%;border:0;border-radius:12px;background:var(--brand-orange);color:white;padding:13px 16px;font:inherit;font-weight:800;cursor:pointer}
      .error{margin:0 0 16px;color:var(--danger);font-weight:700}.foot{margin:18px 0 0;font-size:.8rem;color:var(--muted)}
    </style>
  </head>
  <body>
    <main class="card">
      <h1>TECO</h1>
      <p>Ingresá para administrar tu asistente y revisar la actividad.</p>
      ${errorBlock}
      <form method="post" action="/login" autocomplete="on">
        <label>Usuario<input name="username" autocomplete="username" required autofocus /></label>
        <label>Contraseña<input name="password" type="password" autocomplete="current-password" required /></label>
        <button type="submit">Entrar al panel</button>
      </form>
      <p class="foot">Acceso privado para administradores.</p>
    </main>
  </body>
</html>`);
}

function sendCsv(res, csvContent) {
  res.writeHead(200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": 'attachment; filename="teco-eventos-economicos.csv"',
    "Access-Control-Allow-Origin": "*",
  });
  res.end(csvContent);
}

async function serveStaticFile(res, filePath) {
  const ext = path.extname(filePath);
  const contentType = staticContentTypes[ext] || "application/octet-stream";
  const content = await readFile(filePath);
  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  });
  res.end(content);
}

async function readJsonBody(req) {
  const raw = await readBodyText(req);
  return raw ? JSON.parse(raw) : {};
}

async function readBodyText(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
