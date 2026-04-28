import { describe, expect, it } from 'vitest';
import { parseCookies, serializeSetCookie, clearCookieHeader } from './cookie.js';
import { SESSION_COOKIE_OPTIONS } from '../config/auth.js';

describe('parseCookies', () => {
  it('returns {} for an undefined header', () => {
    expect(parseCookies(undefined)).toEqual({});
  });

  it('returns {} for an empty header', () => {
    expect(parseCookies('')).toEqual({});
  });

  it('parses a single name=value pair', () => {
    expect(parseCookies('sid=abc')).toEqual({ sid: 'abc' });
  });

  it('parses multiple pairs separated by ";"', () => {
    expect(parseCookies('sid=abc; theme=dark; remember=1')).toEqual({
      sid: 'abc', theme: 'dark', remember: '1',
    });
  });

  it('decodes URL-encoded values', () => {
    expect(parseCookies('msg=hello%20world')).toEqual({ msg: 'hello world' });
  });

  it('falls back to the raw value when decoding fails', () => {
    // %ZZ is a malformed escape — decodeURIComponent throws, parser keeps raw.
    expect(parseCookies('weird=%ZZ').weird).toBe('%ZZ');
  });

  it('skips entries that have no "="', () => {
    expect(parseCookies('flag; sid=abc')).toEqual({ sid: 'abc' });
  });

  it('skips entries with an empty key', () => {
    expect(parseCookies('=nope; sid=ok')).toEqual({ sid: 'ok' });
  });

  it('preserves "=" characters inside the value (base64 / JWT-shaped tokens)', () => {
    // The first "=" splits name from value; everything after stays in value.
    // Critical for any future cookie that carries base64 or JWT-style data
    // with trailing/internal "=" padding.
    expect(parseCookies('token=eyJhbGciOiJIUzI1NiJ9.payload.signature==')).toEqual({
      token: 'eyJhbGciOiJIUzI1NiJ9.payload.signature==',
    });
  });

  it('takes the LAST entry when the same cookie name appears multiple times', () => {
    // The cookie spec leaves duplicate-name handling implementation-defined.
    // The current impl writes into a Map, so the last value wins. Pin that
    // semantic so anyone changing it has to consciously choose another rule.
    expect(parseCookies('sid=first; sid=second; sid=third').sid).toBe('third');
  });
});

describe('serializeSetCookie', () => {
  it('emits HttpOnly, Path, SameSite=Lax, and the configured Max-Age', () => {
    const cookie = serializeSetCookie('sid', 'abc123', false);
    expect(cookie).toContain('sid=abc123');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain(`Path=${SESSION_COOKIE_OPTIONS.path}`);
    expect(cookie).toContain(`Max-Age=${SESSION_COOKIE_OPTIONS.maxAge}`);
  });

  it('does not emit Secure when secure=false (local dev over http)', () => {
    expect(serializeSetCookie('sid', 'v', false)).not.toContain('Secure');
  });

  it('emits Secure when secure=true (production / https)', () => {
    expect(serializeSetCookie('sid', 'v', true)).toContain('Secure');
  });

  it('URL-encodes the cookie value so unsafe chars are not injected', () => {
    const cookie = serializeSetCookie('sid', 'a; b=c', false);
    // raw "; " would terminate the cookie attribute list — the encoded form is safe.
    expect(cookie).toContain(encodeURIComponent('a; b=c'));
  });

  it('does NOT emit a Domain attribute (host-only cookie semantics)', () => {
    // Without Domain= the cookie is bound to the exact host that issued
    // it — no leakage to subdomains. A future addition of Domain=
    // (e.g. ".example.com") would broaden the attack surface to every
    // subdomain. Pin the absence so that change has to update the test.
    const cookie = serializeSetCookie('sid', 'v', true);
    expect(cookie).not.toMatch(/\bDomain=/i);
  });

  it('escapes "=" inside cookie value via URL-encoding (no premature attribute split)', () => {
    // A token-like value with an internal "=" must not be interpreted as
    // an attribute boundary. encodeURIComponent maps "=" to "%3D".
    const cookie = serializeSetCookie('sid', 'a=b', false);
    expect(cookie.startsWith('sid=a%3Db;')).toBe(true);
  });
});

describe('clearCookieHeader', () => {
  it('emits Max-Age=0 to clear the cookie immediately', () => {
    const cookie = clearCookieHeader('sid', false);
    expect(cookie).toContain('sid=');
    expect(cookie).toContain('Max-Age=0');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('emits Secure when secure=true', () => {
    expect(clearCookieHeader('sid', true)).toContain('Secure');
  });

  it('NO Domain attribute (matches serializeSetCookie so the browser actually clears)', () => {
    // Browsers only delete a cookie when the clearing Set-Cookie matches
    // the original on (name, Path, Domain). serializeSetCookie omits
    // Domain → clearCookieHeader must omit it too. Pin the symmetry so
    // a future addition of Domain= to one but not the other doesn't
    // produce 'cookie won't go away on logout' bugs.
    const cookie = clearCookieHeader('sid', true);
    expect(cookie).not.toMatch(/\bDomain=/i);
  });

  it('Path matches the issuing serializeSetCookie (so the clear actually targets the same cookie)', () => {
    // Browsers also key on Path. clearCookieHeader hard-codes Path=/ ;
    // serializeSetCookie reads Path from SESSION_COOKIE_OPTIONS. Pin the
    // observable equivalence: both produce 'Path=/' so the clear works.
    expect(clearCookieHeader('sid', false)).toContain('Path=/');
    expect(serializeSetCookie('sid', 'v', false)).toContain('Path=/');
  });
});
