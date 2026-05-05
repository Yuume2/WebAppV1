import { createHmac } from 'node:crypto';
import { request } from 'node:https';
import { request as httpRequest } from 'node:http';
import { URL } from 'node:url';

export function evaluateN8nConfig(env) {
  const baseUrl = (env.N8N_BASE_URL ?? '').trim();
  const secret = (env.N8N_WEBHOOK_SECRET ?? '').trim();
  const questionWh = (env.N8N_QUESTION_NOTIFY_WEBHOOK ?? '').trim();
  const answerWh = (env.N8N_NOTION_ANSWER_WEBHOOK ?? '').trim();
  const baseConfigured = !!(baseUrl && secret);
  const baseUrlOnly = !!baseUrl && !secret;
  const missing = [
    !baseUrl ? 'N8N_BASE_URL' : null,
    !secret ? 'N8N_WEBHOOK_SECRET' : null,
  ].filter(Boolean);
  const missingWebhooks = [
    !questionWh ? 'N8N_QUESTION_NOTIFY_WEBHOOK' : null,
    !answerWh ? 'N8N_NOTION_ANSWER_WEBHOOK' : null,
  ].filter(Boolean);
  let stage;
  if (!baseUrl && !secret) stage = 'missing-all';
  else if (!secret) stage = 'missing-secret';
  else if (!baseConfigured) stage = 'missing-base';
  else if (missingWebhooks.length === 2) stage = 'base-only';
  else if (missingWebhooks.length === 1) stage = 'partial-webhooks';
  else stage = 'configured';
  let summary;
  if (stage === 'missing-all') summary = 'not configured';
  else if (stage === 'missing-secret') summary = 'base URL set, missing secret';
  else if (stage === 'base-only') summary = 'n8n base configured, webhooks missing';
  else if (stage === 'partial-webhooks') summary = `base configured, missing: ${missingWebhooks.join(', ')}`;
  else summary = 'configured';
  return {
    baseConfigured,
    baseUrlOnly,
    baseUrl: baseUrl || null,
    secret: baseConfigured ? secret : null,
    questionWebhook: questionWh || null,
    answerWebhook: answerWh || null,
    questionWebhookConfigured: !!questionWh,
    answerWebhookConfigured: !!answerWh,
    missing,
    missingWebhooks,
    stage,
    summary,
  };
}

export function signPayload(secret, body) {
  return createHmac('sha256', String(secret)).update(body).digest('hex');
}

export function postWebhook({ url, secret, payload, timeoutMs = 6000 }) {
  return new Promise((resolveP) => {
    let parsed;
    try { parsed = new URL(url); } catch { return resolveP({ ok: false, status: 0, reason: 'invalid url' }); }
    const body = Buffer.from(JSON.stringify(payload ?? {}));
    const sig = signPayload(secret, body);
    const opts = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: `${parsed.pathname}${parsed.search}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': body.length,
        'X-Webapp-Signature': sig,
      },
    };
    const reqFn = parsed.protocol === 'https:' ? request : httpRequest;
    const req = reqFn(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolveP({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, raw });
      });
    });
    req.on('error', (err) => resolveP({ ok: false, status: 0, reason: err.message }));
    req.setTimeout(timeoutMs, () => { req.destroy(new Error('n8n request timeout')); });
    req.write(body);
    req.end();
  });
}

export async function notifyQuestion({ config, question, poster = postWebhook }) {
  if (!config.baseConfigured) return { ok: false, skipped: true, reason: 'n8n base not configured' };
  if (!config.questionWebhookConfigured) return { ok: false, skipped: true, reason: 'N8N_QUESTION_NOTIFY_WEBHOOK missing' };
  return await poster({ url: config.questionWebhook, secret: config.secret, payload: { type: 'question', question } });
}
