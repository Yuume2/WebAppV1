// Defense-in-depth: even though the backend MUST redact, we redact again client-side
// before rendering anything that came from logs or errors.

const PATTERNS = [
  // bearer tokens
  /Bearer\s+[A-Za-z0-9_\-\.]+/gi,
  // env-style assignments like FOO_TOKEN=xxx, FOO_KEY=xxx, FOO_SECRET=xxx
  /\b([A-Z0-9_]*(?:TOKEN|KEY|SECRET|PASSWORD|API_KEY))\s*[:=]\s*\S+/gi,
  // GitHub PATs
  /ghp_[A-Za-z0-9]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  // Anthropic/OpenAI keys
  /sk-[A-Za-z0-9_\-]{20,}/g,
  // generic long token-looking strings inside quotes
  /"[A-Za-z0-9_\-]{40,}"/g,
];

export function redact(input) {
  if (input == null) return input;
  let s = typeof input === "string" ? input : JSON.stringify(input);
  for (const re of PATTERNS) s = s.replace(re, (m) => maskKeep(m));
  return s;
}

function maskKeep(s) {
  if (s.length <= 8) return "***";
  return s.slice(0, 4) + "***REDACTED***" + s.slice(-2);
}
