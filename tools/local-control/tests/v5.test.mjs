import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeV5 } from "../public/lib/v5.js";

test("summarizeV5 counts configured groups", () => {
  assert.deepEqual(
    summarizeV5({ claudeAvailable: true, notionConfigured: false, n8nConfigured: false, whatsappConfigured: false }),
    { ok: 1, total: 4, ready: false },
  );
  assert.deepEqual(
    summarizeV5({ claudeAvailable: true, notionConfigured: true, n8nConfigured: true, whatsappConfigured: true }),
    { ok: 4, total: 4, ready: true },
  );
});
