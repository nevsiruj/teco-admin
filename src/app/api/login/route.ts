import { NextRequest, NextResponse } from "next/server";
import { verifyPassword, createSessionToken, setAuthCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { username, password } = body as { username?: string; password?: string };
  if (!username || !password) {
    return NextResponse.json({ error: "Faltan credenciales." }, { status: 400 });
  }
  const envPass = process.env.ADMIN_PASSWORD;
  if (!envPass) {
    return NextResponse.json({ error: "Credenciales no configuradas en el servidor." }, { status: 500 });
  }
  if (username.toLowerCase() !== "admin") {
    return NextResponse.json({ error: "Credenciales incorrectas." }, { status: 401 });
  }
  const ok = await verifyPassword(password, envPass);
  if (!ok) {
    return NextResponse.json({ error: "Credenciales incorrectas." }, { status: 401 });
  }
  const token = createSessionToken(username);
  await setAuthCookie(token, username);
  return NextResponse.json({ ok: true });
}
