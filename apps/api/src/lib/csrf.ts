import type { IncomingMessage } from 'node:http';

/** HTTP methods considered safe — never CSRF-checked. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface CsrfDecision {
  ok: boolean;
  reason?: string;
}

/**
 * Same-origin CSRF check. Strategy:
 * 1. Skip safe methods.
 * 2. If allowedOrigin is "*", permissive — no check (dev / open API).
 * 3. Otherwise the request must carry an Origin header equal to allowedOrigin.
 *    If Origin is absent (some non-browser clients omit it), fall back to
 *    Referer with a same-origin prefix match.
 *
 * Cookies use SameSite=Lax already; this is the second layer that closes the
 * gap on browsers that leak the cookie despite SameSite (older Safari, opted-in
 * cross-site requests, etc.) and on form-submission CSRF.
 */
export function checkCsrf(
  req: IncomingMessage,
  method: string,
  allowedOrigin: string,
): CsrfDecision {
  if (SAFE_METHODS.has(method)) return { ok: true };
  if (allowedOrigin === '*')    return { ok: true };

  const origin = headerStr(req.headers.origin);
  if (origin) {
    return origin === allowedOrigin
      ? { ok: true }
      : { ok: false, reason: `Origin '${origin}' is not allowed` };
  }

  const referer = headerStr(req.headers.referer);
  if (referer && referer.startsWith(`${allowedOrigin}/`)) return { ok: true };
  if (referer === allowedOrigin)                          return { ok: true };

  return {
    ok: false,
    reason: 'Missing or mismatched Origin / Referer header on a state-changing request',
  };
}

function headerStr(v: string | string[] | undefined): string | null {
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && v.length > 0) return v[0] ?? null;
  return null;
}
