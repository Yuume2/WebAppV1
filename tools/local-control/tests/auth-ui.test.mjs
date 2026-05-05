import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TokenStore, ConnState, readTokenFromUrl,
  classifyError, badgeLabel, badgeClass, shouldKeepPolling,
  TOKEN_KEY,
} from "../public/lib/auth-ui.js";
import { AuthError, NetworkError } from "../public/lib/api.js";

test("readTokenFromUrl extracts ?token=... and strips it from href", () => {
  const { token, cleanedHref } = readTokenFromUrl("http://localhost:8787/?token=abc123&foo=1");
  assert.equal(token, "abc123");
  assert.ok(!cleanedHref.includes("token="));
  assert.ok(cleanedHref.includes("foo=1"));
});

test("readTokenFromUrl returns null when no token", () => {
  const { token, cleanedHref } = readTokenFromUrl("http://localhost:8787/");
  assert.equal(token, null);
  assert.equal(cleanedHref, "http://localhost:8787/");
});

test("classifyError maps AuthError to AUTH_REQUIRED", () => {
  assert.equal(classifyError(new AuthError()), ConnState.AUTH_REQUIRED);
  assert.equal(classifyError(new Error("401 unauthorized")), ConnState.AUTH_REQUIRED);
});

test("classifyError maps NetworkError / Failed to fetch to OFFLINE", () => {
  assert.equal(classifyError(new NetworkError("dead")), ConnState.OFFLINE);
  assert.equal(classifyError(new TypeError("Failed to fetch")), ConnState.OFFLINE);
});

test("classifyError defaults to OFFLINE for unknown", () => {
  assert.equal(classifyError(new Error("500 boom")), ConnState.OFFLINE);
  assert.equal(classifyError(null), ConnState.OFFLINE);
});

test("shouldKeepPolling true only for CONNECTED/UNKNOWN", () => {
  assert.equal(shouldKeepPolling(ConnState.CONNECTED), true);
  assert.equal(shouldKeepPolling(ConnState.UNKNOWN), true);
  assert.equal(shouldKeepPolling(ConnState.AUTH_REQUIRED), false);
  assert.equal(shouldKeepPolling(ConnState.OFFLINE), false);
});

test("badgeLabel produces expected strings", () => {
  assert.equal(badgeLabel(ConnState.CONNECTED), "CONNECTED");
  assert.equal(badgeLabel(ConnState.AUTH_REQUIRED), "AUTH REQUIRED");
  assert.equal(badgeLabel(ConnState.OFFLINE), "BACKEND OFFLINE");
});

test("badgeClass picks ok/warn/err class", () => {
  assert.equal(badgeClass(ConnState.CONNECTED), "ok");
  assert.equal(badgeClass(ConnState.AUTH_REQUIRED), "warn");
  assert.equal(badgeClass(ConnState.OFFLINE), "err");
});

test("TokenStore get/set/clear roundtrip with Map storage", () => {
  const store = new Map();
  const fakeStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };
  const ts = new TokenStore(fakeStorage);
  assert.equal(ts.get(), null);
  ts.set("tok");
  assert.equal(store.get(TOKEN_KEY), "tok");
  assert.equal(ts.get(), "tok");
  ts.clear();
  assert.equal(ts.get(), null);
});

test("TokenStore handles null storage without throwing", () => {
  const ts = new TokenStore(null);
  assert.equal(ts.get(), null);
  assert.doesNotThrow(() => ts.set("x"));
  assert.doesNotThrow(() => ts.clear());
});
