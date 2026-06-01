import type { EconomicEvent, LearningSuggestion, OwnerContext, User } from "@/lib/db";

const REMOTE_BASE_URL = (process.env.REMOTE_WOFORY_BASE_URL || "").replace(/\/$/, "");
const REMOTE_USERNAME = process.env.REMOTE_WOFORY_ADMIN_USER || "admin";
const REMOTE_PASSWORD = process.env.REMOTE_WOFORY_ADMIN_PASSWORD || "";

let cachedCookie: { value: string; expiresAt: number } | null = null;

export function isRemoteWoforyEnabled() {
  return Boolean(REMOTE_BASE_URL && REMOTE_PASSWORD);
}

async function getRemoteCookie() {
  if (!isRemoteWoforyEnabled()) return null;
  if (cachedCookie && cachedCookie.expiresAt > Date.now() + 60_000) return cachedCookie.value;

  const response = await fetch(`${REMOTE_BASE_URL}/login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: REMOTE_USERNAME, password: REMOTE_PASSWORD }),
    redirect: "manual",
    cache: "no-store",
  });

  if (response.status !== 303 && response.status !== 302) {
    throw new Error(`Remote login failed with status ${response.status}`);
  }

  const setCookie = response.headers.get("set-cookie");
  const sessionCookie = setCookie?.split(";")[0];
  if (!sessionCookie) throw new Error("Remote login did not return a session cookie");

  cachedCookie = { value: sessionCookie, expiresAt: Date.now() + 10 * 60 * 60 * 1000 };
  return sessionCookie;
}

async function remoteFetch(path: string, init: RequestInit = {}) {
  const cookie = await getRemoteCookie();
  if (!cookie) throw new Error("Remote Wofory is not configured");

  const headers = new Headers(init.headers);
  headers.set("cookie", cookie);

  const response = await fetch(`${REMOTE_BASE_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (response.status === 401) {
    cachedCookie = null;
    const retryCookie = await getRemoteCookie();
    const retryHeaders = new Headers(init.headers);
    if (retryCookie) retryHeaders.set("cookie", retryCookie);
    return fetch(`${REMOTE_BASE_URL}${path}`, {
      ...init,
      headers: retryHeaders,
      cache: "no-store",
    });
  }

  return response;
}

export async function fetchRemoteJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await remoteFetch(path, init);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Remote ${path} failed with status ${response.status}: ${text.slice(0, 200)}`);
  }
  return response.json() as Promise<T>;
}

export async function getRemoteState() {
  return fetchRemoteJson<{
    events?: EconomicEvent[];
    users?: User[];
    suggestions?: LearningSuggestion[];
    ownerContext?: OwnerContext;
    metrics?: unknown;
    llm?: unknown;
    trii?: unknown;
    storage?: unknown;
  }>("/api/state");
}

export async function getRemoteEvents() {
  const state = await getRemoteState();
  return Array.isArray(state.events) ? state.events : [];
}

export async function getRemoteUsers() {
  const payload = await fetchRemoteJson<User[] | { users?: User[] }>("/api/users");
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload.users) ? payload.users : [];
}

export async function getRemoteInteractions() {
  const payload = await fetchRemoteJson<any[] | { interactions?: any[] }>("/api/interactions");
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload.interactions) ? payload.interactions : [];
}

export async function getRemoteSuggestions() {
  const payload = await fetchRemoteJson<LearningSuggestion[] | { suggestions?: LearningSuggestion[] }>(
    "/api/learning-suggestions"
  );
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload.suggestions) ? payload.suggestions : [];
}

export async function proxyRemoteJson(path: string, init: RequestInit = {}) {
  const response = await remoteFetch(path, init);
  const body = await response.text();
  return new Response(body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") || "application/json; charset=utf-8",
    },
  });
}
