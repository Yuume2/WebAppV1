import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiClient, AuthError, NetworkError } from "../public/lib/api.js";

function mockFetch(handler) {
  return (url, init = {}) => {
    const res = handler(url, init);
    return Promise.resolve({
      ok: res.ok ?? true,
      status: res.status ?? 200,
      statusText: res.statusText ?? "OK",
      headers: { get: (k) => (res.headers || {})[k.toLowerCase()] || null },
      json: async () => res.json,
      text: async () => res.text || "",
    });
  };
}

test("get sends Accept JSON and resolves body", async () => {
  globalThis.fetch = mockFetch(() => ({ headers: { "content-type": "application/json" }, json: { ok: true } }));
  const api = new ApiClient({ baseUrl: "" });
  const r = await api.get("/api/health");
  assert.deepEqual(r, { ok: true });
});

test("post serializes body and includes content-type", async () => {
  let captured;
  globalThis.fetch = mockFetch((url, init) => { captured = init; return { headers: { "content-type": "application/json" }, json: { runId: "abc" } }; });
  const api = new ApiClient({ baseUrl: "" });
  const r = await api.post("/api/runner/start", { mode: "plan" });
  assert.equal(r.runId, "abc");
  assert.equal(captured.method, "POST");
  assert.equal(JSON.parse(captured.body).mode, "plan");
});

test("includes bearer header when token set", async () => {
  let captured;
  globalThis.fetch = mockFetch((url, init) => { captured = init; return { headers: { "content-type": "application/json" }, json: {} }; });
  const api = new ApiClient({ baseUrl: "", token: "tok123" });
  await api.get("/api/health");
  assert.match(captured.headers.authorization, /^Bearer tok123$/);
});

test("throws on non-ok response", async () => {
  globalThis.fetch = mockFetch(() => ({ ok: false, status: 500, statusText: "Internal", headers: { "content-type": "text/plain" }, text: "boom" }));
  const api = new ApiClient({ baseUrl: "" });
  await assert.rejects(() => api.get("/x"), /500/);
});

test("401 throws typed AuthError without retry/prompt", async () => {
  let calls = 0;
  globalThis.fetch = mockFetch(() => { calls++; return { ok: false, status: 401, statusText: "Unauthorized", headers: { "content-type": "text/plain" }, text: "no" }; });
  const api = new ApiClient({ baseUrl: "" });
  await assert.rejects(() => api.get("/x"), (err) => err instanceof AuthError && err.status === 401);
  assert.equal(calls, 1, "must not retry on 401");
});

test("network failure throws typed NetworkError", async () => {
  globalThis.fetch = () => Promise.reject(new TypeError("Failed to fetch"));
  const api = new ApiClient({ baseUrl: "" });
  await assert.rejects(() => api.get("/x"), (err) => err instanceof NetworkError);
});

test("setToken persists in localStorage when available", async () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };
  const api = new ApiClient({ baseUrl: "" });
  api.setToken("xyz");
  assert.equal(store.get("localControlToken"), "xyz");
  api.clearToken();
  assert.equal(store.has("localControlToken"), false);
  delete globalThis.localStorage;
});
