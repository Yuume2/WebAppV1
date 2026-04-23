export const SESSION_COOKIE_NAME = 'sid';
export const SESSION_EXPIRY_DAYS = 30;
export const SESSION_EXPIRY_MS = SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: Math.floor(SESSION_EXPIRY_MS / 1000),
};
