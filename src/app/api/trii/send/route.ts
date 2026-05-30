import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { to, text, senderName } = body as { to?: string; text?: string; senderName?: string };
  if (!to || !text) {
    return NextResponse.json({ error: "Faltan campos requeridos (to, text)." }, { status: 400 });
  }
  const apiKey = process.env.TRII_API_KEY || process.env.TRII_TOKEN;
  const endpoint = process.env.TRII_BASE_URL || process.env.TRII_ENDPOINT || "";
  if (!apiKey || !endpoint) {
    return NextResponse.json({ error: "Integración Trii no configurada en el servidor." }, { status: 500 });
  }
  try {
    const res = await fetch(`${endpoint.replace(/\/$/, "")}/messages/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ to, text }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return NextResponse.json(
        { error: `Trii respondió ${res.status}`, detail: data },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, trii: data });
  } catch (err) {
    console.error("Trii send error:", err);
    return NextResponse.json({ error: "No se pudo contactar a Trii." }, { status: 500 });
  }
}
