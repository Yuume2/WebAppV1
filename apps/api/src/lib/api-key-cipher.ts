import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

// ── Key loading ───────────────────────────────────────────────────────────────

/**
 * Returns the pre-validated encryption key from env.
 * Throws if the key was not configured (should have already failed at startup).
 */
export function getEncryptionKey(): Buffer {
  const key = env.providerEncryptionKeyBuffer;
  if (!key) {
    throw new Error(
      'PROVIDER_ENCRYPTION_KEY is not configured. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  return key;
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
