import crypto from "crypto";
import { cookies } from "next/headers";

const SALT = process.env.ADMIN_PASSWORD_SALT || "teco-demo-admin-20260529";
const SESSION_SECRET = process.env.AUTH_SESSION_SECRET || "teco-session-secret";
const COOKIE_NAME = "teco_admin_session";

export function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(SALT + password).digest("hex");
}

export function verifyPassword(password: string, expectedHash: string): boolean {
  const hash = hashPassword(password);
  return hash === expectedHash;
}

export function createSessionToken(username: string): string {
  const payload = JSON.stringify({ user: username, iat: Date.now() });
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
  return Buffer.from(JSON.stringify({ payload, sig })).toString("base64url");
}

export function verifySessionToken(token: string): boolean {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64url").toString());
    const expectedSig = crypto.createHmac("sha256", SESSION_SECRET).update(decoded.payload).digest("hex");
    return expectedSig === decoded.sig;
  } catch {
    return false;
  }
}

export async function isAuthenticated(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return false;
  return verifySessionToken(token);
}

export async function setAuthCookie(token: string, _username: string) {
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12, // 12 hours
  });
}

export async function clearAuthCookie() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}
