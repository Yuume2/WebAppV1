// safety.mjs — secret redaction + sensitive-path detection.

const SECRET_PATTERNS = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bASIA[0-9A-Z]{16}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bAIza[0-9A-Za-z_-]{20,}\b/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bBearer\s+[A-Za-z0-9._-]{16,}\b/gi,
];

const ENV_KEY_RE = /\b([A-Z][A-Z0-9_]{2,}(?:TOKEN|SECRET|KEY|PASSWORD|PASS|API_KEY))\s*=\s*([^\s'"]+)/g;

export function redactSecrets(input, extraTokens = []) {
  if (input == null) return '';
  let out = String(input);
  for (const tok of extraTokens) {
    if (!tok || tok.length < 8) continue;
    const re = new RegExp(escapeRegex(tok), 'g');
    out = out.replace(re, '[REDACTED]');
  }
  for (const re of SECRET_PATTERNS) out = out.replace(re, '[REDACTED]');
  out = out.replace(ENV_KEY_RE, (_, k) => `${k}=[REDACTED]`);
  return out;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const SENSITIVE_PATH_PATTERNS = [
  /^apps\/api\/(src\/)?db\//i,
  /^apps\/api\/src\/lib\/(api-key-cipher|sessions|sentry)/i,
  /^apps\/api\/src\/(auth|billing)/i,
  /(^|\/)\.env(\..+)?$/i,
  /^infra\//i,
  /^\.github\/workflows\//i,
  /(^|\/)package\.json$/i,
  /(^|\/)pnpm-lock\.yaml$/i,
  /(^|\/)pnpm-workspace\.yaml$/i,
  /(^|\/)Dockerfile$/i,
  /(^|\/)docker-compose.*\.ya?ml$/i,
  /(^|\/)turbo\.json$/i,
];

export function isSensitivePath(p) {
  return SENSITIVE_PATH_PATTERNS.some((re) => re.test(p));
}

export function classifyPaths(paths) {
  const sensitive = [];
  const safe = [];
  for (const p of paths) {
    if (isSensitivePath(p)) sensitive.push(p);
    else safe.push(p);
  }
  return { sensitive, safe };
}
