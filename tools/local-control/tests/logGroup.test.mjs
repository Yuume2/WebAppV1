import { test } from "node:test";
import assert from "node:assert/strict";
import { groupLines, formatGrouped, isErrorLine } from "../public/lib/logGroup.js";

test("collapses identical consecutive lines", () => {
  const g = groupLines(["x", "x", "x", "y"]);
  assert.equal(g.length, 2);
  assert.equal(g[0].count, 3);
  assert.equal(g[1].count, 1);
});

test("does not collapse non-consecutive duplicates", () => {
  const g = groupLines(["x", "y", "x"]);
  assert.equal(g.length, 3);
});

test("formatGrouped appends ×N when grouped", () => {
  const out = formatGrouped(groupLines(["a", "a", "a", "b"]));
  assert.match(out, /a\s+×3/);
  assert.match(out, /\nb$/);
});

test("isErrorLine catches common error words", () => {
  assert.equal(isErrorLine("Error: thing failed"), true);
  assert.equal(isErrorLine("Exception ENOENT"), true);
  assert.equal(isErrorLine("everything fine"), false);
});

test("group flag is set for error lines", () => {
  const g = groupLines(["Error: boom", "Error: boom"]);
  assert.equal(g[0].isError, true);
});
