import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { insertEvent, type EconomicEvent } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const event: EconomicEvent = body;
    if (!event.id) event.id = crypto.randomUUID();
    if (!event.createdAt) event.createdAt = new Date().toISOString();
    if (!event.currency) event.currency = "ARS";
    insertEvent(event);
    return NextResponse.json({ ok: true, event });
  } catch (err) {
    console.error("Register error:", err);
    return NextResponse.json({ error: "Error al registrar el evento." }, { status: 500 });
  }
}
