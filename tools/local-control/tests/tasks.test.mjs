import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyTaskReason, computeRunDisabledReason } from "../public/lib/tasks.js";
import { REASONS } from "../public/lib/buttonState.js";

test("blocked task returns blocked reason", () => {
  const r = classifyTaskReason({ classification: "blocked", reason: "guard failed" });
  assert.equal(r.safe, false);
  assert.equal(r.cls, "task-reason-blocked");
  assert.match(r.label, /guard failed/);
});

test("safe task labelled safe", () => {
  const r = classifyTaskReason({ classification: "safe" });
  assert.equal(r.safe, true);
  assert.equal(r.cls, "task-reason-safe");
});

test("trivial classification counted as safe", () => {
  const r = classifyTaskReason({ classification: "trivial" });
  assert.equal(r.safe, true);
});

test("review/risky returns non-safe with reason", () => {
  const r = classifyTaskReason({ classification: "review" });
  assert.equal(r.safe, false);
  assert.match(r.label, /review/);
});

test("computeRunDisabledReason: auth blocks even if executable", () => {
  const r = computeRunDisabledReason({ task: { executable: true }, settings: { allowExec: true }, conn: "auth-required" });
  assert.equal(r, REASONS.AUTH);
});

test("computeRunDisabledReason: allowExec=false blocks", () => {
  const r = computeRunDisabledReason({ task: { executable: true }, settings: { allowExec: false }, conn: "connected" });
  assert.equal(r, REASONS.EXEC);
});

test("computeRunDisabledReason: not executable blocks", () => {
  const r = computeRunDisabledReason({ task: { executable: false }, settings: { allowExec: true }, conn: "connected" });
  assert.equal(r, REASONS.TASK_NOT_EXECUTABLE);
});

test("computeRunDisabledReason: clean path returns null", () => {
  const r = computeRunDisabledReason({ task: { executable: true }, settings: { allowExec: true }, conn: "connected" });
  assert.equal(r, null);
});
