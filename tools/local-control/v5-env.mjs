import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const V5_REQUIRED_KEYS = Object.freeze([
  'CLAUDE_CODE_COMMAND',
  'CLAUDE_CODE_MODE',
  'GITHUB_OWNER',
  'GITHUB_REPO',
]);

export const V5_NOTION_KEYS = Object.freeze([
  'NOTION_TOKEN',
  'NOTION_QUESTIONS_DATABASE_ID',
]);

export const V5_N8N_KEYS = Object.freeze([
  'N8N_BASE_URL',
  'N8N_WEBHOOK_SECRET',
  'N8N_QUESTION_NOTIFY_WEBHOOK',
]);

export const V5_WHATSAPP_KEYS = Object.freeze([
  'WHATSAPP_PROVIDER',
  'WHATSAPP_FROM',
  'WHATSAPP_TO',
]);

export function parseDotEnv(text) {
  const out = {};
  if (!text) return out;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

export function loadV5Env(repoRoot) {
  const file = resolve(repoRoot, '.local-control', 'v5.env');
  if (!existsSync(file)) return { values: {}, file, exists: false };
  try {
    const text = readFileSync(file, 'utf8');
    return { values: parseDotEnv(text), file, exists: true };
  } catch {
    return { values: {}, file, exists: false };
  }
}

function nonEmpty(env, keys) {
  return keys.every((k) => typeof env[k] === 'string' && env[k].length > 0);
}

function missing(env, keys) {
  return keys.filter((k) => !env[k] || env[k].length === 0);
}

export function evaluateV5Env(env) {
  const required = nonEmpty(env, V5_REQUIRED_KEYS);
  const notion = nonEmpty(env, V5_NOTION_KEYS);
  const n8n = nonEmpty(env, V5_N8N_KEYS);
  const whatsapp = nonEmpty(env, V5_WHATSAPP_KEYS);
  const missingByGroup = {
    required: missing(env, V5_REQUIRED_KEYS),
    notion: missing(env, V5_NOTION_KEYS),
    n8n: missing(env, V5_N8N_KEYS),
    whatsapp: missing(env, V5_WHATSAPP_KEYS),
  };
  return {
    requiredOk: required,
    notionConfigured: notion,
    n8nConfigured: n8n,
    whatsappConfigured: whatsapp,
    missingByGroup,
    missingEnv: [...missingByGroup.required, ...missingByGroup.notion, ...missingByGroup.n8n, ...missingByGroup.whatsapp],
  };
}

export function readBoolEnv(env, key, defaultValue = false) {
  const v = env[key];
  if (v == null || v === '') return defaultValue;
  return /^(1|true|yes|on)$/i.test(String(v).trim());
}

export function readIntEnv(env, key, defaultValue) {
  const v = env[key];
  if (v == null || v === '') return defaultValue;
  const n = Number(v);
  return Number.isFinite(n) ? n : defaultValue;
}
