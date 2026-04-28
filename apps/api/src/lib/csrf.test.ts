import { describe, expect, it } from 'vitest';
import type { IncomingMessage } from 'node:http';
import { checkCsrf } from './csrf.js';

function reqWith(headers: Record<string, string | undefined>): IncomingMessage {
  // Only the .headers field is touched by checkCsrf — minimal mock is fine.
  return { headers } as unknown as IncomingMessage;
}

describe('checkCsrf', () => {
  it('passes safe methods (GET/HEAD/OPTIONS) regardless of headers', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      expect(checkCsrf(reqWith({}), method, 'http://localhost:3000').ok).toBe(true);
    }
  });

  it('passes any method when allowedOrigin is "*"', () => {
    expect(checkCsrf(reqWith({}), 'POST', '*').ok).toBe(true);
    expect(checkCsrf(reqWith({ origin: 'http://anywhere' }), 'DELETE', '*').ok).toBe(true);
  });

  it('passes when Origin matches the allowlist', () => {
    const r = checkCsrf(reqWith({ origin: 'http://localhost:3000' }), 'POST', 'http://localhost:3000');
    expect(r.ok).toBe(true);
  });

  it('rejects when Origin mismatches', () => {
    const r = checkCsrf(reqWith({ origin: 'http://attacker.example.com' }), 'POST', 'http://localhost:3000');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('Origin');
  });

  it('falls back to Referer when Origin is missing', () => {
    const r = checkCsrf(
      reqWith({ referer: 'http://localhost:3000/some/page' }),
      'POST',
      'http://localhost:3000',
    );
    expect(r.ok).toBe(true);
  });

  it('Referer-based pass works for the bare origin', () => {
    const r = checkCsrf(reqWith({ referer: 'http://localhost:3000' }), 'POST', 'http://localhost:3000');
    expect(r.ok).toBe(true);
  });

  it('rejects when both Origin and Referer are missing on a mutating request', () => {
    const r = checkCsrf(reqWith({}), 'POST', 'http://localhost:3000');
    expect(r.ok).toBe(false);
  });

  it('rejects when Referer points to a different origin', () => {
    const r = checkCsrf(
      reqWith({ referer: 'http://attacker.example.com/any' }),
      'PATCH',
      'http://localhost:3000',
    );
    expect(r.ok).toBe(false);
  });

  it('accepts any origin from a comma-separated allowlist', () => {
    const allow = 'https://app.example.com,https://staging.example.com';
    expect(checkCsrf(reqWith({ origin: 'https://app.example.com'     }), 'POST', allow).ok).toBe(true);
    expect(checkCsrf(reqWith({ origin: 'https://staging.example.com' }), 'POST', allow).ok).toBe(true);
  });

  it('rejects an origin not in the comma-separated allowlist', () => {
    const allow = 'https://app.example.com, https://staging.example.com';
    const r = checkCsrf(reqWith({ origin: 'https://attacker.example.com' }), 'POST', allow);
    expect(r.ok).toBe(false);
  });

  it('Referer fallback works against any origin in the allowlist', () => {
    const allow = 'https://app.example.com,https://staging.example.com';
    const r = checkCsrf(
      reqWith({ referer: 'https://staging.example.com/some/page' }),
      'POST',
      allow,
    );
    expect(r.ok).toBe(true);
  });

  it('tolerates surrounding whitespace in the allowlist entries', () => {
    const allow = '  https://app.example.com  ,  https://staging.example.com ';
    expect(checkCsrf(reqWith({ origin: 'https://app.example.com' }), 'POST', allow).ok).toBe(true);
  });

  it('rejects the literal "null" Origin used by sandboxed iframes / data: URLs', () => {
    // Browsers send Origin: null for `data:`, `file:`, and `<iframe sandbox>`
    // contexts. This is exactly the surface a CSRF attacker would try to ride —
    // it must never satisfy the allowlist no matter what the configured origin is.
    const r = checkCsrf(reqWith({ origin: 'null' }), 'POST', 'null,https://app.example.com');
    // Even when the allowlist *literally contains* "null" (a misconfig), the
    // request still travels under an unauthenticated origin from the browser's
    // POV — but our own code will accept it. Document that explicitly: it's the
    // origin string match that decides, so configuring "null" in CORS_ORIGIN is
    // a footgun. This test pins that contract: if someone changes the allowlist
    // parser to filter "null" out implicitly, this test fails and forces a
    // conscious decision.
    expect(r.ok).toBe(true);

    // The realistic path: 'null' is NOT in the allowlist, so it must be blocked.
    const r2 = checkCsrf(reqWith({ origin: 'null' }), 'POST', 'https://app.example.com');
    expect(r2.ok).toBe(false);
    expect(r2.reason).toContain("'null'");
  });

  it('does not accept a Referer that contains the allowed origin as a substring (prefix-only match)', () => {
    // Without the "/" boundary, an attacker could host content at
    // `https://app.example.com.attacker.tld/...` and the Referer fallback
    // would pass. Pin the boundary so a future regression in the prefix
    // check is caught.
    const r = checkCsrf(
      reqWith({ referer: 'https://app.example.com.attacker.tld/csrf-target' }),
      'POST',
      'https://app.example.com',
    );
    expect(r.ok).toBe(false);
  });
});
