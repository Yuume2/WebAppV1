export const TOKEN_KEY = "localControlToken";

export const ConnState = Object.freeze({
  UNKNOWN: "unknown",
  CONNECTED: "connected",
  AUTH_REQUIRED: "auth-required",
  OFFLINE: "offline",
});

export function readTokenFromUrl(href) {
  const url = new URL(href);
  const t = url.searchParams.get("token");
  if (!t) return { token: null, cleanedHref: href };
  url.searchParams.delete("token");
  return { token: t.trim(), cleanedHref: url.toString() };
}

export function classifyError(err) {
  if (!err) return ConnState.OFFLINE;
  if (err.name === "AuthError" || /^401\b/.test(String(err.message || ""))) return ConnState.AUTH_REQUIRED;
  if (err.name === "NetworkError" || /Failed to fetch|NetworkError|ECONNREFUSED|ENOTFOUND/i.test(String(err.message || ""))) return ConnState.OFFLINE;
  return ConnState.OFFLINE;
}

export function shouldKeepPolling(state) {
  return state === ConnState.CONNECTED || state === ConnState.UNKNOWN;
}

export function badgeLabel(state) {
  switch (state) {
    case ConnState.CONNECTED: return "CONNECTED";
    case ConnState.AUTH_REQUIRED: return "AUTH REQUIRED";
    case ConnState.OFFLINE: return "BACKEND OFFLINE";
    default: return "…";
  }
}

export function badgeClass(state) {
  switch (state) {
    case ConnState.CONNECTED: return "ok";
    case ConnState.AUTH_REQUIRED: return "warn";
    case ConnState.OFFLINE: return "err";
    default: return "";
  }
}

export class TokenStore {
  constructor(storage) { this.storage = storage; }
  get() { try { return this.storage?.getItem(TOKEN_KEY) || null; } catch { return null; } }
  set(t) { try { if (t) this.storage?.setItem(TOKEN_KEY, t); } catch {} }
  clear() { try { this.storage?.removeItem(TOKEN_KEY); } catch {} }
}
