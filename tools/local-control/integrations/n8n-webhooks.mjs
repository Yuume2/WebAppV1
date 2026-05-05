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
  return {
    baseConfigured,
    baseUrl: baseConfigured ? baseUrl : null,
    secret: baseConfigured ? secret : null,
    questionWebhook: questionWh || null,
    answerWebhook: answerWh || null,
    questionWebhookConfigured: !!questionWh,
    answerWebhookConfigured: !!answerWh,
    missing: [
      !baseUrl ? 'N8N_BASE_URL' : null,
      !secret ? 'N8N_WEBHOOK_SECRET' : null,
    ].filter(Boolean),
    missingWebhooks: [
      !questionWh ? 'N8N_QUESTION_NOTIFY_WEBHOOK' : null,
      !answerWh ? 'N8N_NOTION_ANSWER_WEBHOOK' : null,
    ].filter(Boolean),
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
