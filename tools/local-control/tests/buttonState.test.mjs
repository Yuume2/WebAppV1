import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeDisabledReason, applyDisabled, setLoading, setSuccess, setError,
  runWithState, REASONS,
} from "../public/lib/buttonState.js";

function fakeBtn() {
  const cls = new Set();
  const attrs = new Map();
  return {
    disabled: false,
    classList: {
      add: (c) => cls.add(c),
      remove: (...c) => c.forEach((x) => cls.delete(x)),
      contains: (c) => cls.has(c),
    },
    setAttribute: (k, v) => attrs.set(k, v),
    removeAttribute: (k) => attrs.delete(k),
    getAttribute: (k) => attrs.get(k),
    _cls: cls,
    _attrs: attrs,
  };
}

test("disabled reason: auth required wins over everything", () => {
  const r = computeDisabledReason({ need: "exec", conn: "auth-required", settings: { allowExec: true } });
  assert.equal(r, REASONS.AUTH);
});

test("disabled reason: offline blocks", () => {
  assert.equal(computeDisabledReason({ need: "exec", conn: "offline" }), REASONS.OFFLINE);
});

test("disabled reason: exec needs allowExec", () => {
  assert.equal(computeDisabledReason({ need: "exec", conn: "connected", settings: { allowExec: false } }), REASONS.EXEC);
  assert.equal(computeDisabledReason({ need: "exec", conn: "connected", settings: { allowExec: true } }), null);
});

test("disabled reason: loop needs allowLoop", () => {
  assert.equal(computeDisabledReason({ need: "loop", conn: "connected", settings: {} }), REASONS.LOOP);
});

test("disabled reason: automerge needs allowAutoMerge", () => {
  assert.equal(computeDisabledReason({ need: "automerge", conn: "connected", settings: {} }), REASONS.AUTOMERGE);
});

test("disabled reason: task-run requires executable", () => {
  assert.equal(computeDisabledReason({ need: "task-run", conn: "connected", settings: { allowExec: true }, taskExecutable: false }), REASONS.TASK_NOT_EXECUTABLE);
});

test("disabled reason: active run blocks new runs", () => {
  const r = computeDisabledReason({ need: "exec", conn: "connected", settings: { allowExec: true }, hasActiveRun: true });
  assert.equal(r, REASONS.ACTIVE_RUN);
});

test("applyDisabled writes title + data-disabled-reason", () => {
  const b = fakeBtn();
  applyDisabled(b, REASONS.AUTH);
  assert.equal(b.disabled, true);
  assert.equal(b.getAttribute("title"), REASONS.AUTH);
  assert.equal(b.getAttribute("data-disabled-reason"), REASONS.AUTH);
});

test("applyDisabled clears when reason null", () => {
  const b = fakeBtn();
  applyDisabled(b, REASONS.AUTH);
  applyDisabled(b, null);
  assert.equal(b.disabled, false);
  assert.equal(b.getAttribute("title"), undefined);
});

test("setLoading then setSuccess transitions classes", () => {
  const b = fakeBtn();
  setLoading(b);
  assert.ok(b._cls.has("is-loading"));
  assert.equal(b.disabled, true);
  setSuccess(b);
  assert.ok(!b._cls.has("is-loading"));
  assert.ok(b._cls.has("is-success"));
});

test("setError marks error class and re-enables", () => {
  const b = fakeBtn();
  setLoading(b);
  setError(b, "boom");
  assert.ok(b._cls.has("is-error"));
  assert.equal(b.disabled, false);
});

test("runWithState success path", async () => {
  const b = fakeBtn();
  const r = await runWithState(b, async () => 42);
  assert.equal(r, 42);
});

test("runWithState rethrows and marks error", async () => {
  const b = fakeBtn();
  await assert.rejects(() => runWithState(b, async () => { throw new Error("nope"); }), /nope/);
  assert.ok(b._cls.has("is-error"));
});
