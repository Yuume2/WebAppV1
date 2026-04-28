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
});
