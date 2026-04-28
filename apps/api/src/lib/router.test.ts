import { describe, expect, it } from 'vitest';
import { Router } from './router.js';
import type { RouteHandler } from './http.js';

const noop: RouteHandler = () => ({ httpStatus: 200, body: { ok: true, data: null } });

describe('Router.match', () => {
  it('returns null for an unknown path', () => {
    const r = new Router();
    expect(r.match('GET', '/nope')).toBeNull();
  });

  it('matches an exact GET route with no params', () => {
    const r = new Router();
    r.register({ method: 'GET', path: '/v1/health', handler: noop });
    const m = r.match('GET', '/v1/health');
    expect(m).not.toBeNull();
    expect(m!.params).toEqual({});
  });

  it('matches a parameterised path and extracts named params', () => {
    const r = new Router();
    r.register({ method: 'GET', path: '/v1/projects/:id', handler: noop });
    const m = r.match('GET', '/v1/projects/abc-123');
    expect(m).not.toBeNull();
    expect(m!.params).toEqual({ id: 'abc-123' });
  });

  it('extracts multiple params in the same path', () => {
    const r = new Router();
    r.register({ method: 'GET', path: '/v1/workspaces/:wsId/items/:itemId', handler: noop });
    const m = r.match('GET', '/v1/workspaces/ws_1/items/it_2');
    expect(m).not.toBeNull();
    expect(m!.params).toEqual({ wsId: 'ws_1', itemId: 'it_2' });
  });

  it('decodes URL-encoded param values', () => {
    const r = new Router();
    r.register({ method: 'GET', path: '/v1/things/:slug', handler: noop });
    const m = r.match('GET', '/v1/things/hello%20world');
    expect(m!.params['slug']).toBe('hello world');
  });

  it('exact paths win over patterns of the same shape', () => {
    const r = new Router();
    r.register({ method: 'POST', path: '/v1/messages/stream', handler: noop });
    r.register({ method: 'GET',  path: '/v1/messages/:id',     handler: noop });
    // Different methods — both must resolve independently.
    expect(r.match('POST', '/v1/messages/stream')!.params).toEqual({});
    expect(r.match('GET',  '/v1/messages/abc')!.params).toEqual({ id: 'abc' });
  });

  it('matches by exact method only', () => {
    const r = new Router();
    r.register({ method: 'GET', path: '/v1/x', handler: noop });
    expect(r.match('POST', '/v1/x')).toBeNull();
  });

  it('throws when the same method+exact path is registered twice', () => {
    const r = new Router();
    r.register({ method: 'GET', path: '/v1/dup', handler: noop });
    expect(() => r.register({ method: 'GET', path: '/v1/dup', handler: noop })).toThrow(/Duplicate route/);
  });
});

describe('Router.allowedMethods', () => {
  it('lists every method registered for a given exact path', () => {
    const r = new Router();
    r.register({ method: 'GET',    path: '/v1/projects/:id', handler: noop });
    r.register({ method: 'PATCH',  path: '/v1/projects/:id', handler: noop });
    r.register({ method: 'DELETE', path: '/v1/projects/:id', handler: noop });
    const methods = r.allowedMethods('/v1/projects/abc').sort();
    expect(methods).toEqual(['DELETE', 'GET', 'PATCH']);
  });

  it('returns [] when no method matches', () => {
    const r = new Router();
    r.register({ method: 'GET', path: '/v1/x', handler: noop });
    expect(r.allowedMethods('/v1/y')).toEqual([]);
  });
});

describe('Router.hasPath', () => {
  it('is true for a known exact path', () => {
    const r = new Router();
    r.register({ method: 'GET', path: '/v1/x', handler: noop });
    expect(r.hasPath('/v1/x')).toBe(true);
  });

  it('is true for a path that matches a pattern', () => {
    const r = new Router();
    r.register({ method: 'GET', path: '/v1/x/:id', handler: noop });
    expect(r.hasPath('/v1/x/abc')).toBe(true);
  });

  it('is false for an unknown path', () => {
    const r = new Router();
    r.register({ method: 'GET', path: '/v1/x', handler: noop });
    expect(r.hasPath('/v1/y')).toBe(false);
  });
});
