import { env } from '../config/env.js';
import { respond, type InternalResult, type RequestContext } from '../lib/http.js';

export interface VersionResponse {
  service: 'webapp-api';
  version: string;
  /** Optional commit SHA — populated from GIT_SHA / VERCEL_GIT_COMMIT_SHA / RENDER_GIT_COMMIT, when set. */
  commit: string | null;
  /** Node runtime version. */
  node: string;
  buildTimestamp: string;
}

const BUILD_TIMESTAMP = new Date().toISOString();

function readCommit(): string | null {
  return (
    process.env.GIT_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.RENDER_GIT_COMMIT ??
    null
  );
}

export function versionController(_ctx: RequestContext): InternalResult {
  const data: VersionResponse = {
    service: 'webapp-api',
    version: env.serviceVersion,
    commit:  readCommit(),
    node:    process.version,
    buildTimestamp: BUILD_TIMESTAMP,
  };
  return respond(data);
}
