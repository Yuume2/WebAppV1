import { sql } from 'drizzle-orm';
import { env } from '../config/env.js';
import { createDb } from '../lib/db.js';
import { respond, respondError, type InternalResult, type RequestContext } from '../lib/http.js';

export type DbStatus = 'ok' | 'down' | 'disabled';

export interface HealthDeepDeps {
  /** Returns 'ok' when the DB answers a trivial query, 'down' on any failure,
   *  'disabled' when no DATABASE_URL is configured. */
  pingDb: () => Promise<DbStatus>;
}

const DEFAULT_TIMEOUT_MS = 5_000;

async function defaultPingDb(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<DbStatus> {
  if (!env.databaseUrl) return 'disabled';
  let db;
  try {
    db = createDb();
  } catch {
    return 'down';
  }
  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, reject) => setTimeout(() => reject(new Error('db_ping_timeout')), timeoutMs)),
    ]);
    return 'ok';
  } catch {
    return 'down';
  }
}

export function makeHealthDeepDeps(): HealthDeepDeps {
  return { pingDb: () => defaultPingDb() };
}

export interface HealthDeepResponse {
  service: 'webapp-api';
  version: string;
  db: DbStatus;
  timestamp: string;
}

export async function healthDeepController(
  _ctx: RequestContext,
  deps: HealthDeepDeps,
): Promise<InternalResult> {
  const db = await deps.pingDb();
  const body: HealthDeepResponse = {
    service: 'webapp-api',
    version: env.serviceVersion,
    db,
    timestamp: new Date().toISOString(),
  };
  if (db === 'down') {
    return respondError('internal_error', 'Database is unreachable', 503, body);
  }
  return respond(body);
}
