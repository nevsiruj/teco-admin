import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAllUsers, upsertUser, type User } from "@/lib/db";

export async function GET() {
  return NextResponse.json(getAllUsers());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, phone } = body as { name?: string; phone?: string };
  if (!phone) return NextResponse.json({ error: "El teléfono es requerido." }, { status: 400 });
  const now = new Date().toISOString();
  const user: User = {
    id: crypto.randomUUID(),
    name: name || null,
    phone: phone.replace(/\D/g, ""),
    source: "manual-ui",
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
  };
  upsertUser(user);
  return NextResponse.json({ ok: true, user });
}
