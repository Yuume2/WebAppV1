import { timingSafeEqual } from 'node:crypto';

export function extractToken(req) {
  const h = req.headers['authorization'];
  if (typeof h === 'string' && h.startsWith('Bearer ')) return h.slice(7).trim();
  const url = new URL(req.url, 'http://localhost');
  const q = url.searchParams.get('token');
  if (q) return q.trim();
  return null;
}

export function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  try { return timingSafeEqual(ab, bb); } catch { return false; }
}

export function isAuthenticated(req, expectedToken) {
  const t = extractToken(req);
  if (!t || !expectedToken) return false;
  return constantTimeEqual(t, expectedToken);
}
