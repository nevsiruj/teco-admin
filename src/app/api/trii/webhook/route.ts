import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { upsertUser, insertEvent, type EconomicEvent, type User } from "@/lib/db";
import { interpretMessage } from "@/lib/llm";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const msg = body?.message || body;
    const text = (msg?.text || msg?.Body || "").trim();
    const sender = msg?.from || msg?.sender?.id || msg?.Phone || "";
    if (!text) return NextResponse.json({ ok: true, ignored: true });

    const phone = (sender || "").replace(/[^0-9+]/g, "");
    const result = await interpretMessage(text, "", phone);
    const now = new Date().toISOString();

    if (phone) {
      const user: User = {
        id: crypto.randomUUID(),
        name: result.normalizedEvent.workerName || null,
        phone: phone.replace(/\D/g, ""),
        source: "trii-webhook",
        createdAt: now,
        updatedAt: now,
        lastSeenAt: now,
      };
      upsertUser(user);
    }

    const ev = result.normalizedEvent;
    if (ev.economicKind && (ev.amount || ev.paymentStatus)) {
      if (!ev.id) ev.id = crypto.randomUUID();
      if (!ev.createdAt) ev.createdAt = now;
      if (!ev.originChannel) ev.originChannel = "trii";
      ev.workerPhone = phone;
      insertEvent(ev);
    }

    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error("Trii webhook error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
