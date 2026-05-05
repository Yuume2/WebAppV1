import { test } from "node:test";
import assert from "node:assert/strict";
import { PRESETS } from "../public/lib/prompt.js";

const REQUIRED = ["plan-next-task", "run-one-safe-task", "loop-safe-tasks", "resume-after-answer", "analyze-blockage"];

test("all 5 required presets exist", () => {
  for (const k of REQUIRED) {
    assert.ok(PRESETS[k], `missing preset ${k}`);
    assert.ok(PRESETS[k].length > 10, `preset ${k} text too short`);
  }
});

test("loop preset mentions dry-run", () => {
  assert.match(PRESETS["loop-safe-tasks"], /dry/i);
});

test("plan preset mentions plan only", () => {
  assert.match(PRESETS["plan-next-task"], /plan/i);
});
