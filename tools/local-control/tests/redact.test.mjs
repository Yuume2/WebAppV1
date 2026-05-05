import { test } from "node:test";
import assert from "node:assert/strict";
import { redact } from "../public/lib/redact.js";

test("redacts bearer tokens", () => {
  const s = "Authorization: Bearer abcdef1234567890";
  const out = redact(s);
  assert.ok(!out.includes("abcdef1234567890"));
  assert.match(out, /REDACTED/);
});

test("redacts env-style assignments", () => {
  const out = redact("GITHUB_TOKEN=ghp_abcdefghijklmnopqrst1234567890");
  assert.ok(!out.includes("ghp_abcdefghijklmnopqrst1234567890"));
});

test("redacts openai-style sk- keys", () => {
  const out = redact('"key":"sk-proj-abcdefghijklmnopqrstuvwxyz"');
  assert.ok(!out.includes("sk-proj-abcdefghijklmnopqrstuvwxyz"));
});

test("leaves harmless strings alone", () => {
  const s = "Hello world, this is fine.";
  assert.equal(redact(s), s);
});

test("handles non-string input", () => {
  assert.equal(redact(null), null);
  assert.equal(typeof redact({ a: 1 }), "string");
});
