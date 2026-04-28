import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from './logger.js';

describe('logger', () => {
  let logs: string[];
  let warns: string[];
  let errors: string[];

  beforeEach(() => {
    logs = [];
    warns = [];
    errors = [];
    vi.spyOn(console, 'log').mockImplementation((line: string) => { logs.push(line); });
    vi.spyOn(console, 'warn').mockImplementation((line: string) => { warns.push(line); });
    vi.spyOn(console, 'error').mockImplementation((line: string) => { errors.push(line); });
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('writes a JSON line on info() with ts, level, msg', () => {
    logger.info('hello');
    expect(logs).toHaveLength(1);
    const parsed = JSON.parse(logs[0]!) as { ts: string; level: string; msg: string };
    expect(parsed.level).toBe('info');
    expect(parsed.msg).toBe('hello');
    expect(() => new Date(parsed.ts).toISOString()).not.toThrow();
  });

  it('routes warn() to console.warn and error() to console.error', () => {
    logger.warn('w');
    logger.error('e');
    expect(warns).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });

  it('merges meta fields into the payload', () => {
    logger.info('hello', { requestId: 'r-1', status: 200 });
    const parsed = JSON.parse(logs[0]!) as Record<string, unknown>;
    expect(parsed.requestId).toBe('r-1');
    expect(parsed.status).toBe(200);
  });

  it('does NOT crash when meta contains a circular reference', () => {
    // JSON.stringify throws on circular refs. The logger sits inside the
    // request pipeline — a throw here would crash the response. The safe
    // fallback emits a minimal envelope keyed off log_serialization_failed.
    const meta: Record<string, unknown> = { name: 'x' };
    meta.self = meta;
    expect(() => logger.info('with-circular', meta)).not.toThrow();
    expect(logs).toHaveLength(1);
    const parsed = JSON.parse(logs[0]!) as Record<string, unknown>;
    expect(parsed.error).toBe('log_serialization_failed');
    expect(parsed.msg).toBe('with-circular');
  });

  it('does NOT crash when meta contains a BigInt (also unstringifiable by default)', () => {
    expect(() => logger.warn('with-bigint', { count: BigInt(1) })).not.toThrow();
    const parsed = JSON.parse(warns[0]!) as Record<string, unknown>;
    expect(parsed.error).toBe('log_serialization_failed');
  });
});
