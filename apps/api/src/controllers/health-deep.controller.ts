import { sql } from 'drizzle-orm';
import { env } from '../config/env.js';
import { createDb } from '../lib/db.js';
import { respond, respondError, type InternalResult, type RequestContext } from '../lib/http.js';

export type DbStatus = 'ok' | 'down' | 'disabled';

export interface DbPingResult {
  status: DbStatus;
  /** Wall-clock time spent on the ping (including connect). null when disabled. */
  latencyMs: number | null;
}

export interface HealthDeepDeps {
  /** Returns 'ok' when the DB answers a trivial query, 'down' on any failure,
   *  'disabled' when no DATABASE_URL is configured. */
  pingDb: () => Promise<DbPingResult>;
}

const DEFAULT_TIMEOUT_MS = 5_000;

async function defaultPingDb(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<DbPingResult> {
  if (!env.databaseUrl) return { status: 'disabled', latencyMs: null };
  const startedAt = Date.now();
  let db;
  try {
    db = createDb();
  } catch {
    return { status: 'down', latencyMs: Date.now() - startedAt };
  }
  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, reject) => setTimeout(() => reject(new Error('db_ping_timeout')), timeoutMs)),
    ]);
    return { status: 'ok', latencyMs: Date.now() - startedAt };
  } catch {
    return { status: 'down', latencyMs: Date.now() - startedAt };
  }
}

export function makeHealthDeepDeps(): HealthDeepDeps {
  return { pingDb: () => defaultPingDb() };
}

export interface HealthDeepResponse {
  service: 'webapp-api';
  version: string;
  db: DbStatus;
  /** DB ping latency in ms; null when DB is disabled. */
  dbLatencyMs: number | null;
  timestamp: string;
}

export async function healthDeepController(
  _ctx: RequestContext,
  deps: HealthDeepDeps,
): Promise<InternalResult> {
  const ping = await deps.pingDb();
  const body: HealthDeepResponse = {
    service: 'webapp-api',
    version: env.serviceVersion,
    db: ping.status,
    dbLatencyMs: ping.latencyMs,
    timestamp: new Date().toISOString(),
  };
  if (ping.status === 'down') {
    return respondError('internal_error', 'Database is unreachable', 503, body);
  }
  return respond(body);
}
