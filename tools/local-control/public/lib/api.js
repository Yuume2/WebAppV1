export class AuthError extends Error {
  constructor(msg = "401 unauthorized") { super(msg); this.name = "AuthError"; this.status = 401; }
}
export class NetworkError extends Error {
  constructor(msg = "backend unreachable") { super(msg); this.name = "NetworkError"; }
}

export class ApiClient {
  constructor({ baseUrl = "", token = null } = {}) {
    this.baseUrl = baseUrl;
    this.token = token;
  }
  _headers(extra = {}) {
    const h = { "content-type": "application/json", ...extra };
    if (this.token) h["authorization"] = `Bearer ${this.token}`;
    return h;
  }
  setToken(t) {
    this.token = t || null;
    try { if (t) localStorage.setItem("localControlToken", t); } catch {}
  }
  clearToken() {
    this.token = null;
    try { localStorage.removeItem("localControlToken"); } catch {}
  }
  async _fetch(path, opts = {}) {
    let res;
    try {
      res = await fetch(this.baseUrl + path, opts);
    } catch (e) {
      throw new NetworkError(String(e?.message || e));
    }
    if (res.status === 401) {
      throw new AuthError("401 unauthorized");
    }
    if (!res.ok) {
      let msg = `${res.status} ${res.statusText}`;
      try { const j = await res.json(); if (j?.error) msg += `: ${j.error}`; } catch {}
      throw new Error(msg);
    }
    const ct = res.headers.get("content-type") || "";
    return ct.includes("application/json") ? res.json() : res.text();
  }
  get(path) { return this._fetch(path, { headers: this._headers() }); }
  post(path, body) { return this._fetch(path, { method: "POST", headers: this._headers(), body: JSON.stringify(body || {}) }); }
  put(path, body) { return this._fetch(path, { method: "PUT", headers: this._headers(), body: JSON.stringify(body || {}) }); }
  del(path) { return this._fetch(path, { method: "DELETE", headers: this._headers() }); }

  subscribe(runId, { onLog, onStatus, onDone, onError } = {}) {
    const q = this.token ? `?token=${encodeURIComponent(this.token)}` : "";
    const url = `${this.baseUrl}/api/runs/${encodeURIComponent(runId)}/events${q}`;
    const es = new EventSource(url);
    if (onLog) es.addEventListener("log", (e) => onLog(safeJson(e.data)));
    if (onStatus) es.addEventListener("status", (e) => onStatus(safeJson(e.data)));
    if (onDone) es.addEventListener("done", (e) => { onDone(safeJson(e.data)); es.close(); });
    if (onError) es.addEventListener("error", (e) => onError(e));
    return es;
  }
}

function safeJson(s) { try { return JSON.parse(s); } catch { return s; } }
