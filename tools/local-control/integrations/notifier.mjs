import { evaluateN8nConfig, postWebhook } from './n8n-webhooks.mjs';
import { evaluateNotionConfig } from './notion-questions.mjs';
import { evaluateWhatsappConfig } from './whatsapp.mjs';

export const MISSION_EVENTS = Object.freeze([
  'mission_started',
  'issue_failed',
  'pr_created',
  'question_required',
  'mission_completed',
]);

export function evaluateNotifierStatus(env = {}) {
  const n8n = evaluateN8nConfig(env);
  const notion = evaluateNotionConfig(env);
  const whatsapp = evaluateWhatsappConfig(env);
  const providers = [];
  providers.push({
    id: 'n8n',
    label: 'n8n webhooks',
    optional: true,
    ready: n8n.baseConfigured && n8n.questionWebhookConfigured,
    summary: n8n.summary,
    detail: n8n.stage,
  });
  providers.push({
    id: 'notion',
    label: 'Notion',
    optional: true,
    ready: notion.configured,
    summary: notion.summary,
    detail: notion.stage,
  });
  providers.push({
    id: 'whatsapp',
    label: 'WhatsApp',
    optional: true,
    ready: whatsapp.configured,
    summary: whatsapp.configured ? `via ${whatsapp.via}` : 'optional',
    detail: whatsapp.provider ?? 'unset',
  });
  const anyReady = providers.some((p) => p.ready);
  return {
    providers,
    anyReady,
    fallback: anyReady ? null : 'local-only',
    summary: anyReady
      ? providers.filter((p) => p.ready).map((p) => p.id).join(', ')
      : 'no remote provider configured (local mission report only)',
  };
}

export class MissionNotifier {
  constructor({ env = {}, fetchImpl = null, logger = null } = {}) {
    this.env = env;
    this.fetch = fetchImpl;
    this.logger = logger;
    this.events = [];
    this.status = evaluateNotifierStatus(env);
  }

  describe() {
    return {
      providers: this.status.providers,
      anyReady: this.status.anyReady,
      summary: this.status.summary,
      fallback: this.status.fallback,
      eventsCount: this.events.length,
    };
  }

  async notify(eventName, payload = {}) {
    if (!MISSION_EVENTS.includes(eventName)) {
      return { ok: false, dispatched: [], reason: 'unknown event' };
    }
    const entry = {
      event: eventName,
      at: new Date().toISOString(),
      payload: safePayload(payload),
    };
    this.events.push(entry);
    if (this.events.length > 200) this.events.splice(0, this.events.length - 200);
    if (this.logger?.append) {
      try { this.logger.append('notifier', 'event', JSON.stringify(entry)); } catch { /* best-effort */ }
    }
    const dispatched = [];
    const n8n = evaluateN8nConfig(this.env);
    if (n8n.baseConfigured && n8n.questionWebhookConfigured) {
      try {
        const res = await postWebhook({
          url: n8n.questionWebhook,
          secret: n8n.secret,
          payload: { type: 'mission_event', event: eventName, ...entry.payload },
        });
        dispatched.push({ provider: 'n8n', ok: !!res.ok, status: res.status ?? 0 });
      } catch (err) {
        dispatched.push({ provider: 'n8n', ok: false, status: 0, reason: err?.message ?? 'error' });
      }
    } else {
      dispatched.push({ provider: 'n8n', ok: false, status: 0, reason: 'n8n not configured' });
    }
    const notion = evaluateNotionConfig(this.env);
    if (notion.configured) {
      dispatched.push({ provider: 'notion', ok: true, status: 200, mode: 'queued' });
    } else {
      dispatched.push({ provider: 'notion', ok: false, status: 0, reason: 'notion not configured' });
    }
    const whatsapp = evaluateWhatsappConfig(this.env);
    if (whatsapp.configured) {
      dispatched.push({ provider: 'whatsapp', ok: true, status: 200, mode: whatsapp.via ?? 'twilio' });
    } else {
      dispatched.push({ provider: 'whatsapp', ok: false, status: 0, reason: 'whatsapp not configured' });
    }
    return { ok: true, dispatched, recorded: entry };
  }

  recent({ limit = 50 } = {}) {
    return this.events.slice(-limit).reverse();
  }
}

function safePayload(payload) {
  if (!payload || typeof payload !== 'object') return {};
  const seen = new WeakSet();
  function clean(value) {
    if (value == null) return value;
    if (typeof value === 'string') return value.length > 1000 ? value.slice(0, 1000) + '…' : value;
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.slice(0, 50).map(clean);
    if (typeof value === 'object') {
      if (seen.has(value)) return '[circular]';
      seen.add(value);
      const out = {};
      let count = 0;
      for (const [k, v] of Object.entries(value)) {
        if (count++ > 50) break;
        if (/token|secret|password/i.test(k)) continue;
        out[k] = clean(v);
      }
      return out;
    }
    return undefined;
  }
  return clean(payload);
}

export function buildNullNotifier() {
  return {
    describe() { return { providers: [], anyReady: false, summary: 'disabled', fallback: 'disabled', eventsCount: 0 }; },
    async notify() { return { ok: true, dispatched: [], recorded: null }; },
    recent() { return []; },
  };
}
