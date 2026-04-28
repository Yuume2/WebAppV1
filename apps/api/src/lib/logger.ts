type Level = 'info' | 'warn' | 'error';

function safeStringify(payload: unknown): string {
  try {
    return JSON.stringify(payload);
  } catch {
    // JSON.stringify throws on circular refs and BigInts. The logger sits
    // inside the request pipeline — a crash here would take the response
    // with it. Fall back to a minimal envelope so observability stays up
    // even if a caller logged a self-referential object by accident.
    const fallback = (payload && typeof payload === 'object' && 'msg' in payload)
      ? { ts: new Date().toISOString(), level: 'error', msg: String((payload as { msg: unknown }).msg), error: 'log_serialization_failed' }
      : { ts: new Date().toISOString(), level: 'error', msg: 'log_serialization_failed' };
    return JSON.stringify(fallback);
  }
}

function emit(level: Level, msg: string, meta?: Record<string, unknown>): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(meta ?? {}),
  };
  const line = safeStringify(payload);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => emit('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit('error', msg, meta),
};
