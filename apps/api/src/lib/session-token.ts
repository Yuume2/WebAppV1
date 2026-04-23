import { randomBytes, createHash } from 'node:crypto';
import { SESSION_EXPIRY_MS } from '../config/auth.js';

/** 32 random bytes as a 64-char hex string — sent to the client as the cookie value. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

/** SHA-256 of the raw token — stored in the DB instead of the token itself. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Absolute expiry Date for a new session. */
export function sessionExpiresAt(): Date {
  return new Date(Date.now() + SESSION_EXPIRY_MS);
}
