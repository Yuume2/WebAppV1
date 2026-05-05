import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { evaluateNotionConfig, buildQuestionPage, NOTION_PROPERTIES_EXPECTED } from './notion-questions.mjs';
import { evaluateN8nConfig, signPayload } from './n8n-webhooks.mjs';
import { evaluateWhatsappConfig, buildQuestionMessage } from './whatsapp.mjs';

test('evaluateNotionConfig flags missing token', () => {
  const r = evaluateNotionConfig({ NOTION_QUESTIONS_DATABASE_ID: 'abc' });
  assert.equal(r.configured, false);
  assert.deepEqual(r.missing, ['NOTION_TOKEN']);
});
test('evaluateNotionConfig configured when both set', () => {
  const r = evaluateNotionConfig({ NOTION_TOKEN: 'secret', NOTION_QUESTIONS_DATABASE_ID: 'db' });
  assert.equal(r.configured, true);
  assert.equal(r.token, 'secret');
});
test('buildQuestionPage produces required props', () => {
  const page = buildQuestionPage({
    databaseId: 'db1',
    question: { id: 'q-1', issue: 42, title: 'Need help', question: 'X?', options: ['A', 'B'], recommendation: 'A', githubUrl: 'http://gh', createdAt: '2026-01-01T00:00:00Z' },
  });
  assert.equal(page.parent.database_id, 'db1');
  assert.ok(page.properties['Name']);
  assert.ok(page.properties['Question ID']);
  assert.equal(page.properties['Issue Number'].number, 42);
});
test('NOTION_PROPERTIES_EXPECTED includes Status and Question ID', () => {
  assert.ok(NOTION_PROPERTIES_EXPECTED.includes('Status'));
  assert.ok(NOTION_PROPERTIES_EXPECTED.includes('Question ID'));
});

test('evaluateN8nConfig requires base + secret', () => {
  const r = evaluateN8nConfig({ N8N_BASE_URL: 'https://x', N8N_WEBHOOK_SECRET: '' });
  assert.equal(r.baseConfigured, false);
});
test('evaluateN8nConfig flags missing webhooks', () => {
  const r = evaluateN8nConfig({
    N8N_BASE_URL: 'https://x', N8N_WEBHOOK_SECRET: 'k',
  });
  assert.equal(r.baseConfigured, true);
  assert.deepEqual(r.missingWebhooks.sort(), ['N8N_NOTION_ANSWER_WEBHOOK', 'N8N_QUESTION_NOTIFY_WEBHOOK'].sort());
});
test('signPayload deterministic hex', () => {
  const sig = signPayload('s', '{"a":1}');
  assert.match(sig, /^[a-f0-9]{64}$/);
  assert.equal(signPayload('s', '{"a":1}'), sig);
});

test('evaluateWhatsappConfig flags missing provider', () => {
  const r = evaluateWhatsappConfig({});
  assert.equal(r.configured, false);
  assert.ok(r.missing.includes('WHATSAPP_PROVIDER'));
});
test('evaluateWhatsappConfig configured for n8n provider', () => {
  const r = evaluateWhatsappConfig({ WHATSAPP_PROVIDER: 'n8n', WHATSAPP_FROM: 'me', WHATSAPP_TO: 'you' });
  assert.equal(r.configured, true);
  assert.equal(r.via, 'n8n');
});
test('evaluateWhatsappConfig requires twilio creds for twilio provider', () => {
  const r = evaluateWhatsappConfig({ WHATSAPP_PROVIDER: 'twilio', WHATSAPP_FROM: 'a', WHATSAPP_TO: 'b' });
  assert.equal(r.configured, false);
});
test('buildQuestionMessage includes options and recommendation', () => {
  const msg = buildQuestionMessage({ issue: 7, question: 'Pick one', options: ['A', 'B'], recommendation: 'A' });
  assert.match(msg, /#7/);
  assert.match(msg, /Options/);
  assert.match(msg, /A/);
  assert.match(msg, /Claude recommends/);
});
