import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { evaluateNotionConfig } from './notion-questions.mjs';
import { evaluateN8nConfig } from './n8n-webhooks.mjs';

test('Notion stage missing-token when only DB id set', () => {
  const r = evaluateNotionConfig({ NOTION_QUESTIONS_DATABASE_ID: 'abc' });
  assert.equal(r.stage, 'missing-token');
  assert.match(r.summary, /NOTION_TOKEN/);
});
test('Notion stage configured when both set', () => {
  const r = evaluateNotionConfig({ NOTION_TOKEN: 't', NOTION_QUESTIONS_DATABASE_ID: 'd' });
  assert.equal(r.stage, 'configured');
  assert.equal(r.summary, 'configured');
});
test('Notion stage missing-database-id when only token', () => {
  const r = evaluateNotionConfig({ NOTION_TOKEN: 't' });
  assert.equal(r.stage, 'missing-database-id');
});
test('Notion stage missing-all when nothing set', () => {
  const r = evaluateNotionConfig({});
  assert.equal(r.stage, 'missing-all');
});

test('n8n stage base-only when base+secret but webhooks empty', () => {
  const r = evaluateN8nConfig({ N8N_BASE_URL: 'https://n8n', N8N_WEBHOOK_SECRET: 's' });
  assert.equal(r.stage, 'base-only');
  assert.equal(r.summary, 'n8n base configured, webhooks missing');
});
test('n8n stage partial-webhooks when one webhook set', () => {
  const r = evaluateN8nConfig({ N8N_BASE_URL: 'https://n8n', N8N_WEBHOOK_SECRET: 's', N8N_QUESTION_NOTIFY_WEBHOOK: 'https://n8n/q' });
  assert.equal(r.stage, 'partial-webhooks');
  assert.match(r.summary, /N8N_NOTION_ANSWER_WEBHOOK/);
});
test('n8n stage configured when all set', () => {
  const r = evaluateN8nConfig({
    N8N_BASE_URL: 'https://n8n', N8N_WEBHOOK_SECRET: 's',
    N8N_QUESTION_NOTIFY_WEBHOOK: 'https://n8n/q', N8N_NOTION_ANSWER_WEBHOOK: 'https://n8n/a',
  });
  assert.equal(r.stage, 'configured');
});
test('n8n stage missing-secret when base url only', () => {
  const r = evaluateN8nConfig({ N8N_BASE_URL: 'https://n8n' });
  assert.equal(r.stage, 'missing-secret');
  assert.match(r.summary, /missing secret/);
});
test('n8n stage missing-all when nothing', () => {
  const r = evaluateN8nConfig({});
  assert.equal(r.stage, 'missing-all');
  assert.equal(r.summary, 'not configured');
});
