import { describe, expect, it } from 'vitest';
import { s } from './schema.js';

describe('schema.string', () => {
  it('accepts a plain string', () => {
    expect(s.string().parse('hi')).toEqual({ ok: true, value: 'hi' });
  });

  it('rejects a non-string with the field path', () => {
    const r = s.string().parse(42, 'name');
    expect(r).toEqual({ ok: false, errors: [{ path: 'name', message: 'must be a string' }] });
  });

  it('enforces min, max, and pattern', () => {
    expect(s.string({ min: 3 }).parse('ab', 'x').ok).toBe(false);
    expect(s.string({ max: 2 }).parse('abc', 'x').ok).toBe(false);
    expect(s.string({ pattern: /^[a-z]+$/ }).parse('A1', 'x').ok).toBe(false);
  });

  it('trims when asked', () => {
    expect(s.string({ trim: true }).parse('  hi  ')).toEqual({ ok: true, value: 'hi' });
  });
});

describe('schema.number', () => {
  it('rejects NaN and non-numbers', () => {
    expect(s.number().parse(NaN, 'n').ok).toBe(false);
    expect(s.number().parse('1', 'n').ok).toBe(false);
  });

  it('enforces int + range', () => {
    expect(s.number({ int: true }).parse(1.5, 'n').ok).toBe(false);
    expect(s.number({ min: 0, max: 10 }).parse(11, 'n').ok).toBe(false);
  });
});

describe('schema.enumOf', () => {
  it('accepts only listed values', () => {
    const sch = s.enumOf(['a', 'b'] as const);
    expect(sch.parse('a').ok).toBe(true);
    expect(sch.parse('c', 'kind').ok).toBe(false);
  });
});

describe('schema.optional', () => {
  it('accepts undefined and delegates otherwise', () => {
    const sch = s.optional(s.string({ min: 1 }));
    expect(sch.parse(undefined)).toEqual({ ok: true, value: undefined });
    expect(sch.parse('a')).toEqual({ ok: true, value: 'a' });
    expect(sch.parse('', 'x').ok).toBe(false);
  });
});

describe('schema.nullable', () => {
  it('accepts null', () => {
    expect(s.nullable(s.string()).parse(null)).toEqual({ ok: true, value: null });
  });
});

describe('schema.array', () => {
  it('reports per-item errors with indexed paths', () => {
    const sch = s.array(s.string());
    const r = sch.parse(['ok', 1]);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected fail');
    expect(r.errors).toEqual([{ path: '[1]', message: 'must be a string' }]);
  });
});

describe('schema.object', () => {
  const Body = s.object({
    name: s.string({ min: 1 }),
    age: s.optional(s.number({ int: true, min: 0 })),
  });

  it('accepts a valid body', () => {
    expect(Body.parse({ name: 'A', age: 1 })).toEqual({ ok: true, value: { name: 'A', age: 1 } });
  });

  it('drops missing optional fields cleanly', () => {
    const r = Body.parse({ name: 'A' });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('expected ok');
    expect(r.value).toEqual({ name: 'A' });
  });

  it('aggregates errors with dotted paths', () => {
    const r = Body.parse({ name: '', age: -1 });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected fail');
    expect(r.errors.map((e) => e.path).sort()).toEqual(['age', 'name']);
  });

  it('rejects non-objects', () => {
    expect(Body.parse([]).ok).toBe(false);
    expect(Body.parse(null).ok).toBe(false);
    expect(Body.parse('x').ok).toBe(false);
  });
});
