import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;

// ── Key loading ───────────────────────────────────────────────────────────────

/**
 * Reads PROVIDER_ENCRYPTION_KEY from process.env and returns a 32-byte Buffer.
 * Throws clearly if the env var is absent or malformed.
 *
 * Generate a valid key with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
export function getEncryptionKey(): Buffer {
  const raw = process.env.PROVIDER_ENCRYPTION_KEY;
  if (!raw || raw.length !== KEY_BYTES * 2) {
    throw new Error(
      'PROVIDER_ENCRYPTION_KEY must be set to a 64-character hex string (32 bytes). ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  const buf = Buffer.from(raw, 'hex');
  if (buf.length !== KEY_BYTES) {
    throw new Error('PROVIDER_ENCRYPTION_KEY contains invalid hex characters');
  }
  return buf;
}

// ── Pure cipher functions (key passed explicitly — easy to unit-test) ─────────

/**
 * Encrypts a plaintext API key using AES-256-GCM.
 * Returns `iv_hex:authTag_hex:ciphertext_hex`.
 */
export function encryptWithKey(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts a ciphertext produced by `encryptWithKey`.
 * Throws if the ciphertext is malformed or the auth tag does not verify
 * (i.e. wrong key or tampered data).
 */
export function decryptWithKey(stored: string, key: Buffer): string {
  const parts = stored.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted API key format');
  const [ivHex, tagHex, ciphertextHex] = parts as [string, string, string];
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
}

// ── Env-aware wrappers (use these in production code) ─────────────────────────

/** Encrypts a plaintext API key using the key from PROVIDER_ENCRYPTION_KEY. */
export function encryptApiKey(plaintext: string): string {
  return encryptWithKey(plaintext, getEncryptionKey());
}

/** Decrypts a stored API key using the key from PROVIDER_ENCRYPTION_KEY. */
export function decryptApiKey(stored: string): string {
  return decryptWithKey(stored, getEncryptionKey());
}
