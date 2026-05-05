import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiClient } from "../public/lib/api.js";

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

test("401 without prompt rejects (no window in node)", async () => {
  globalThis.fetch = mockFetch(() => ({ ok: false, status: 401, statusText: "Unauthorized", headers: { "content-type": "text/plain" }, text: "no" }));
  const api = new ApiClient({ baseUrl: "" });
  await assert.rejects(() => api.get("/x"), /401/);
});
