import { NextRequest, NextResponse } from "next/server";
import { interpretMessage, type LLMResult } from "@/lib/llm";
import { getAllEvents, insertEvent, insertInteraction, getOwnerContext, type EconomicEvent } from "@/lib/db";
import { getRemoteInteractions, isRemoteWoforyEnabled, proxyRemoteJson } from "@/lib/remote-wofory";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    if (isRemoteWoforyEnabled()) {
      const body = await req.json();
      const remoteBody = await buildRemoteBodyWithConversationContext(body);
      const remoteResponse = await proxyRemoteJson("/api/process", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(remoteBody),
      });
      const payload = await remoteResponse.json().catch(() => null);
      if (!payload || typeof payload !== "object") return NextResponse.json(payload, { status: remoteResponse.status });

      const reply =
        payload.reply ||
        payload.workerFeedback ||
        payload.clarificationMessage ||
        payload.historyQuery?.answer ||
        "";
      const remoteTracking = payload.tracking || {};
      const workerTotals = remoteTracking.workerTotals || {};
      const tracking = payload.tracking
        ? {
            ...remoteTracking,
            totalEvents: remoteTracking.totalEvents ?? workerTotals.totalEvents,
            totalCollected: remoteTracking.totalCollected ?? workerTotals.totalCollected,
            collectedEvents: remoteTracking.collectedEvents ?? workerTotals.collectedEvents,
            pendingEvents: remoteTracking.pendingEvents ?? workerTotals.pendingEvents,
            pendingCollectionEvents:
              remoteTracking.pendingCollectionEvents ?? workerTotals.pendingCollectionAmount,
          }
        : null;

      return NextResponse.json(
        {
          ...payload,
          reply,
          tracking,
          contextualMessageUsed: remoteBody.message !== body.message,
          originalMessage: body.message,
          normalizedEvent: payload.normalizedEvent || payload.savedEvent || payload.events?.[0] || null,
          llmMode: payload.llmMode || payload.mode || payload.llm?.mode || "remote-demo",
          model: "LLM",
        },
        { status: remoteResponse.status }
      );
    }

    const body = await req.json();
    const { workerName, workerPhone, message, sendViaTrii } = body as {
      workerName?: string;
      workerPhone?: string;
      message?: string;
      sendViaTrii?: boolean;
    };

    if (!message?.trim()) {
      return NextResponse.json({ error: "El mensaje no puede estar vacío." }, { status: 400 });
    }

    const events = getAllEvents();
    const historySummary = events
      .filter((e) => e.workerPhone === workerPhone || e.workerName === workerName)
      .slice(0, 10)
      .map((e) => `- ${e.economicLabel || e.economicKind}: $${e.amount || "?"} (${e.paymentStatus || "?"})`)
      .join("\n");

    const result: LLMResult = await interpretMessage(message, workerName || "", workerPhone || "", historySummary);
    const event = result.normalizedEvent;
    event.workerName = workerName || event.workerName;
    event.workerPhone = workerPhone || event.workerPhone;

    if (!event.id) event.id = crypto.randomUUID();
    if (!event.createdAt) event.createdAt = new Date().toISOString();
    if (!event.currency) event.currency = "ARS";

    // Save event if it has any meaningful data
    if (event.economicKind || event.amount || event.paymentStatus || event.category) {
      insertEvent(event);
    }

    insertInteraction({
      id: crypto.randomUUID(),
      event_id: event.id,
      worker_name: event.workerName,
      worker_phone: event.workerPhone,
      user_message: message,
      llm_reply: result.workerFeedback || result.clarificationMessage || "",
      llm_model: process.env.MIMO_MODEL || "llm",
      source: event.originChannel || "web",
      created_at: new Date().toISOString(),
    });

    // Generate tracking
    const workerEvents = [...events, event].filter(
      (e) => e.workerPhone === workerPhone || e.workerName === workerName
    );
    const workerCollected = workerEvents.filter((e) => e.paymentStatus === "cobrado");
    const workerPending = workerEvents.filter((e) => e.paymentStatus === "pendiente_cobro");

    const tracking = {
      totalEvents: workerEvents.length,
      totalCollected: workerCollected.reduce((s, e) => s + (Number(e.amount) || 0), 0),
      collectedEvents: workerCollected.length,
      pendingEvents: workerPending.length,
      pendingCollectionEvents: workerPending.reduce((s, e) => s + (Number(e.amount) || 0), 0),
    };

    // Detect if this is a greeting-only message with no economic content
    const isGreeting = !event.economicKind && !event.amount && !event.paymentStatus;
    const isNewUser = !events.some(
      (e) => (e.workerPhone && e.workerPhone === workerPhone) || (e.workerName && e.workerName === workerName)
    );

    // Prepend welcome message for new users
    let reply = result.workerFeedback || result.clarificationMessage || "";
    if (isGreeting && isNewUser) {
      const ctx = getOwnerContext();
      const welcome = ctx.welcomeMessage || "";
      const dataNotice = ctx.dataUsageNotice ? ` ${ctx.dataUsageNotice}` : "";
      reply = `${welcome}${dataNotice}`.trim();
      if (isGreeting && !result.workerFeedback) {
        // Also ask first economic event prompt
        reply += " Para empezar, mandame el primer evento económico en una frase.";
      }
    }

    return NextResponse.json({
      ...result,
      reply,
      tracking,
      llmMode: process.env.MIMO_API_KEY ? "live" : "heuristic-fallback",
    });
  } catch (err) {
    console.error("Process error:", err);
    return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
  }
}

function normalizePhone(value?: string) {
  return String(value || "").replace(/\D/g, "");
}

function getInteractionInput(interaction: any) {
  return interaction?.input || {
    workerName: interaction?.worker_name || interaction?.workerName,
    workerPhone: interaction?.worker_phone || interaction?.workerPhone,
    message: interaction?.user_message || interaction?.message,
  };
}

function looksLikeContinuation(message?: string) {
  const text = String(message || "").trim().toLowerCase();
  if (!text) return false;
  return /^(parte\s*\d+|tamb[ié]n|adem[aá]s|y\s+|ahora\s+|despu[eé]s\s+)/i.test(text) ||
    /\b(fue en|en barrio|zona|cobr[eé]|me pagaron|ya me pagaron|transferencia|efectivo|queda pendiente|pendiente de cobro|son\s+\d|por\s+\d|\$\s*\d)\b/i.test(text);
}

function hasIncompleteEconomicOutput(interaction: any) {
  const output = interaction?.output || {};
  const missing = Array.isArray(output.missingFields) ? output.missingFields : [];
  return missing.length > 0 && !output.savedEventId && !(Array.isArray(output.savedEventIds) && output.savedEventIds.length);
}

async function buildRemoteBodyWithConversationContext(body: any) {
  const message = String(body?.message || "");
  const phone = normalizePhone(body?.workerPhone);
  if (!phone || !looksLikeContinuation(message)) return body;

  try {
    const interactions = await getRemoteInteractions();
    const recent = interactions
      .map((interaction: any) => ({ interaction, input: getInteractionInput(interaction) }))
      .filter(({ input }: any) => normalizePhone(input?.workerPhone) === phone && input?.message)
      .filter(({ interaction }: any) => hasIncompleteEconomicOutput(interaction))
      .slice(0, 3)
      .reverse();

    if (!recent.length) return body;

    const parts = recent.map(({ input }: any) => String(input.message).trim()).filter(Boolean);
    if (parts.includes(message.trim())) return body;

    return {
      ...body,
      message: [...parts, message.trim()].join("\n"),
    };
  } catch {
    return body;
  }
}
