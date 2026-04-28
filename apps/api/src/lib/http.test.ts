import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import {
  fail,
  getClientIp,
  isHttpMethod,
  isRecord,
  ok,
  respondCreated,
  respondError,
  respondNoContent,
  respondNotFound,
  respondRateLimited,
} from './http.js';

function reqWith(opts: {
  forwarded?: string | string[] | undefined;
  remoteAddress?: string | undefined;
}): IncomingMessage {
  const headers: Record<string, string | string[] | undefined> = {};
  if (opts.forwarded !== undefined) headers['x-forwarded-for'] = opts.forwarded;
  return {
    headers,
    socket: opts.remoteAddress === undefined ? {} : { remoteAddress: opts.remoteAddress },
  } as unknown as IncomingMessage;
}

describe('getClientIp', () => {
  it('returns the first hop from a single-IP X-Forwarded-For', () => {
    expect(getClientIp(reqWith({ forwarded: '203.0.113.1' }))).toBe('203.0.113.1');
  });

  it('returns the first hop from a comma-separated X-Forwarded-For list', () => {
    // The first entry is the original client; subsequent entries are proxies.
    expect(getClientIp(reqWith({ forwarded: '203.0.113.1, 10.0.0.1, 10.0.0.2' }))).toBe('203.0.113.1');
  });

  it('trims whitespace around the first hop', () => {
    expect(getClientIp(reqWith({ forwarded: '  203.0.113.1  ,  10.0.0.1' }))).toBe('203.0.113.1');
  });

  it('falls back to socket.remoteAddress when no X-Forwarded-For header is present', () => {
    expect(getClientIp(reqWith({ remoteAddress: '198.51.100.7' }))).toBe('198.51.100.7');
  });

  it('returns "unknown" when neither X-Forwarded-For nor socket.remoteAddress is available', () => {
    expect(getClientIp(reqWith({}))).toBe('unknown');
  });

  it('falls back to socket.remoteAddress when X-Forwarded-For is the array form (duplicate headers)', () => {
    // Node exposes duplicate headers as string[]. The current impl only handles
    // the string form; an array should fall through to the socket address rather
    // than silently returning 'unknown' and bucketing every duplicate-header
    // request into the same rate-limit bucket.
    expect(getClientIp(reqWith({ forwarded: ['203.0.113.1', '203.0.113.2'], remoteAddress: '198.51.100.7' }))).toBe('198.51.100.7');
  });
});

describe('respondCreated', () => {
  it('returns a 201 with the data wrapped in an ok envelope', () => {
    const r = respondCreated({ id: 'abc' });
    expect(r.httpStatus).toBe(201);
    expect(r.body).toEqual({ ok: true, data: { id: 'abc' } });
    expect(r.headers).toBeUndefined();
  });

  it('attaches a Location header when one is provided', () => {
    const r = respondCreated({ id: 'abc' }, '/v1/projects/abc');
    expect(r.headers).toEqual({ Location: '/v1/projects/abc' });
  });
});

describe('respondNoContent', () => {
  it('returns a 204 with the data:null ok envelope (writeJson short-circuits the body)', () => {
    const r = respondNoContent();
    expect(r.httpStatus).toBe(204);
    expect(r.body).toEqual({ ok: true, data: null });
  });
});

describe('respondError', () => {
  it('defaults to status 400 with the given code and message', () => {
    const r = respondError('validation_error', 'bad input');
    expect(r.httpStatus).toBe(400);
    expect(r.body).toEqual({ ok: false, error: { code: 'validation_error', message: 'bad input' } });
  });

  it('honours an explicit status', () => {
    const r = respondError('unauthenticated', 'no session', 401);
    expect(r.httpStatus).toBe(401);
  });

  it('attaches details only when supplied (no spurious "details": undefined leaks)', () => {
    const without = respondError('validation_error', 'bad');
    if (without.body.ok) throw new Error('expected error envelope');
    expect('details' in without.body.error).toBe(false);

    const withDetails = respondError('validation_error', 'bad', 400, { field: 'email' });
    if (withDetails.body.ok) throw new Error('expected error envelope');
    expect(withDetails.body.error.details).toEqual({ field: 'email' });
  });
});

describe('respondNotFound', () => {
  it('returns a 404 with not_found code and the supplied message', () => {
    const r = respondNotFound('Project xyz not found');
    expect(r.httpStatus).toBe(404);
    if (r.body.ok) throw new Error('expected error envelope');
    expect(r.body.error.code).toBe('not_found');
    expect(r.body.error.message).toBe('Project xyz not found');
  });
});

describe('respondRateLimited', () => {
  it('returns a 429 with rate_limited code and the Retry-After header', () => {
    const r = respondRateLimited(120);
    expect(r.httpStatus).toBe(429);
    if (r.body.ok) throw new Error('expected error envelope');
    expect(r.body.error.code).toBe('rate_limited');
    expect(r.headers).toEqual({ 'Retry-After': '120' });
  });
});

describe('envelope invariants — ok() / fail()', () => {
  it('ok() never carries an error field', () => {
    const env = ok({ x: 1 });
    expect(env.ok).toBe(true);
    expect('error' in env).toBe(false);
  });

  it('fail() never carries a data field', () => {
    const env = fail('validation_error', 'bad');
    expect(env.ok).toBe(false);
    expect('data' in env).toBe(false);
  });

  it('fail() omits details when not supplied (no spurious details: undefined in JSON)', () => {
    const env = fail('validation_error', 'bad');
    if (env.ok) throw new Error('expected error envelope');
    expect('details' in env.error).toBe(false);
    // Round-trip through JSON to confirm: a stray undefined would either
    // crash JSON.stringify (no — JSON drops undefined) or appear as
    // a missing key. Accept either, but pin the *parsed* shape.
    const parsed = JSON.parse(JSON.stringify(env));
    expect(parsed.error).not.toHaveProperty('details');
  });
});

describe('isHttpMethod', () => {
  it('accepts the seven canonical methods', () => {
    for (const m of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      expect(isHttpMethod(m)).toBe(true);
    }
  });

  it('rejects non-canonical or undefined methods', () => {
    expect(isHttpMethod(undefined)).toBe(false);
    expect(isHttpMethod('TRACE')).toBe(false);
    expect(isHttpMethod('PROPFIND')).toBe(false);
    expect(isHttpMethod('get')).toBe(false); // case-sensitive
  });
});

describe('isRecord', () => {
  it('accepts plain objects', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it('rejects null, arrays, primitives', () => {
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(isRecord('s')).toBe(false);
    expect(isRecord(1)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
  });
});
