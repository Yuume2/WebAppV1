import { SESSION_COOKIE_OPTIONS } from '../config/auth.js';

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const raw = part.slice(idx + 1).trim();
    if (!key) continue;
    try { result[key] = decodeURIComponent(raw); }
    catch { result[key] = raw; }
  }
  return result;
}

export function serializeSetCookie(name: string, value: string, secure: boolean): string {
  const { maxAge, path, sameSite } = SESSION_COOKIE_OPTIONS;
  const samesiteVal = sameSite.charAt(0).toUpperCase() + sameSite.slice(1);
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Max-Age=${maxAge}`,
    `Path=${path}`,
    'HttpOnly',
    `SameSite=${samesiteVal}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearCookieHeader(name: string): string {
  return `${name}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`;
}
