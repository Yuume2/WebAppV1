import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';

const SALT_BYTES = 16;
const KEY_LEN = 64;

function deriveKey(plain: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(plain, salt, KEY_LEN, (err, derived) => (err ? reject(err) : resolve(derived)));
  });
}

/** Returns `salt_hex:key_hex` — safe to store directly in password_hash column. */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await deriveKey(plain, salt);
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}

/** Constant-time comparison. Returns false on any malformed stored hash. */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const colonIdx = stored.indexOf(':');
  if (colonIdx === -1) return false;
  const saltHex = stored.slice(0, colonIdx);
  const keyHex = stored.slice(colonIdx + 1);
  if (!saltHex || keyHex.length !== KEY_LEN * 2) return false;
  try {
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(keyHex, 'hex');
    const actual = await deriveKey(plain, salt);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
