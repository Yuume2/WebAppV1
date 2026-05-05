import { test } from "node:test";
import assert from "node:assert/strict";
import { validateRunnerForm, validateSettings, parseCsv } from "../public/lib/validate.js";

test("plan dry-run passes", () => {
  assert.equal(validateRunnerForm({ mode: "plan", maxPRs: 3, maxMinutes: 20, dryRun: true, allowExec: false, allowLoop: false, allowAutoMerge: false, issue: null }), null);
});

test("exec without allowExec and not dry-run blocks", () => {
  const err = validateRunnerForm({ mode: "exec", maxPRs: 3, maxMinutes: 20, dryRun: false, allowExec: false, allowLoop: false, allowAutoMerge: false, issue: 41 });
  assert.match(err, /allowExec/);
});

test("loop without allowLoop blocks", () => {
  const err = validateRunnerForm({ mode: "loop", maxPRs: 3, maxMinutes: 20, dryRun: true, allowExec: false, allowLoop: false, allowAutoMerge: false, issue: null });
  assert.match(err, /loop/);
});

test("auto-merge incompatible with dry-run", () => {
  const err = validateRunnerForm({ mode: "exec", maxPRs: 3, maxMinutes: 20, dryRun: true, allowExec: true, allowLoop: false, allowAutoMerge: true, issue: 41 });
  assert.match(err, /auto-merge/);
});

test("rejects out-of-range maxPRs", () => {
  const err = validateRunnerForm({ mode: "plan", maxPRs: 999, maxMinutes: 20, dryRun: true, allowExec: false, allowLoop: false, allowAutoMerge: false, issue: null });
  assert.match(err, /maxPRs/);
});

test("settings rejects bad staleDays", () => {
  assert.match(validateSettings({ staleDays: -1 }), /staleDays/);
  assert.match(validateSettings({ staleDays: 999 }), /staleDays/);
});

test("settings rejects bad maxPrsPerRun", () => {
  assert.match(validateSettings({ maxPrsPerRun: 0 }), /maxPrsPerRun/);
  assert.match(validateSettings({ maxPrsPerRun: 11 }), /maxPrsPerRun/);
});

test("parseCsv splits and trims", () => {
  assert.deepEqual(parseCsv(" a, b ,c, "), ["a", "b", "c"]);
  assert.deepEqual(parseCsv(""), []);
});
