import { test } from "node:test";
import assert from "node:assert/strict";
import { computeOnboardingState } from "../public/lib/onboarding.js";

test("connected + dry-run + LAN URL", () => {
  const s = computeOnboardingState({
    conn: "connected",
    settings: { dryRunDefault: true, lanEnabled: true },
    network: { lan: true, localUrl: "http://127.0.0.1:8787", lanUrl: "http://192.168.1.42:8787", lanEnabled: true },
  });
  assert.equal(s.server, "connecté");
  assert.equal(s.auth, "OK");
  assert.equal(s.mode, "LAN");
  assert.equal(s.dryRun, "DRY-RUN");
  assert.equal(s.localUrl, "http://127.0.0.1:8787");
  assert.equal(s.lanUrl, "http://192.168.1.42:8787");
  assert.equal(s.lanHint, "ready");
});

test("auth required hides LAN URL", () => {
  const s = computeOnboardingState({ conn: "auth-required", settings: null, network: null });
  assert.equal(s.server, "token requis");
  assert.equal(s.auth, "token requis");
});

test("LAN disabled flags hint", () => {
  const s = computeOnboardingState({
    conn: "connected",
    settings: { dryRunDefault: false, lanEnabled: false },
    network: { lan: false, lanEnabled: false, localUrl: "http://127.0.0.1:8787", lanUrl: null },
  });
  assert.equal(s.mode, "local");
  assert.equal(s.dryRun, "LIVE");
  assert.equal(s.lanHint, "lan-disabled");
});

test("LAN enabled but IP unknown", () => {
  const s = computeOnboardingState({
    conn: "connected",
    settings: { dryRunDefault: true, lanEnabled: true },
    network: { lan: true, lanEnabled: true, lanUrl: null, localUrl: "http://127.0.0.1:8787" },
  });
  assert.equal(s.lanHint, "ip-unknown");
});

test("offline state surfaces", () => {
  const s = computeOnboardingState({ conn: "offline" });
  assert.equal(s.server, "offline");
});
