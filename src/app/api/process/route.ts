import { NextRequest, NextResponse } from "next/server";
import { interpretMessage, type LLMResult } from "@/lib/llm";
import { getAllEvents, insertEvent, insertInteraction, type EconomicEvent } from "@/lib/db";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
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

    return NextResponse.json({
      ...result,
      tracking,
      llmMode: process.env.MIMO_API_KEY ? "live" : "heuristic-fallback",
    });
  } catch (err) {
    console.error("Process error:", err);
    return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
  }
}
