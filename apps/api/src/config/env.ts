export interface ApiEnv {
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
  serviceVersion: string;
  corsOrigin: string;
  maxBodyBytes: number;
  enableDevEndpoints: boolean;
  databaseUrl: string | undefined;
  providerEncryptionKey: string | undefined;
  providerEncryptionKeyBuffer: Buffer | undefined;
  openaiMaxContextMessages: number;
}

function parsePort(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid API_PORT: "${raw}"`);
  }
  return parsed;
}

function parseNodeEnv(raw: string | undefined): ApiEnv['nodeEnv'] {
  if (raw === 'production' || raw === 'test') return raw;
  return 'development';
}

function parseMaxBodyBytes(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid API_MAX_BODY_BYTES: "${raw}"`);
  }
  return parsed;
}

function parseContextLimit(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid OPENAI_MAX_CONTEXT_MESSAGES: "${raw}" must be a positive integer`);
  }
  return parsed;
}

/**
 * Validates and parses PROVIDER_ENCRYPTION_KEY.
 *
 * Rules:
 * - If set: must be exactly 64 hex characters (32 bytes). Throws immediately if malformed.
 * - If absent AND databaseUrl is set: throws — DB mode requires the key so provider
 *   connections can be encrypted and decrypted at startup, not on first use.
 * - If both absent: returns undefined (in-memory / keyless mode is intentional).
 */
export function parseProviderEncryptionKey(
  raw: string | undefined,
  databaseUrl: string | undefined,
): Buffer | undefined {
  if (raw) {
    if (raw.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(raw)) {
      throw new Error(
        'PROVIDER_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
      );
    }
    return Buffer.from(raw, 'hex');
  }

  if (databaseUrl) {
    throw new Error(
      'PROVIDER_ENCRYPTION_KEY is required when DATABASE_URL is set. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }

  return undefined;
}

const nodeEnv = parseNodeEnv(process.env.NODE_ENV);
const databaseUrl = process.env.DATABASE_URL;

export const env: ApiEnv = {
  port: parsePort(process.env.API_PORT, 4000),
  nodeEnv,
  serviceVersion: process.env.API_VERSION ?? '0.1.0',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  maxBodyBytes: parseMaxBodyBytes(process.env.API_MAX_BODY_BYTES, 100 * 1024),
  enableDevEndpoints: process.env.ENABLE_DEV_ENDPOINTS !== undefined
    ? process.env.ENABLE_DEV_ENDPOINTS === 'true'
    : nodeEnv !== 'production',
  databaseUrl,
  providerEncryptionKey: process.env.PROVIDER_ENCRYPTION_KEY,
  providerEncryptionKeyBuffer: parseProviderEncryptionKey(process.env.PROVIDER_ENCRYPTION_KEY, databaseUrl),
  openaiMaxContextMessages: parseContextLimit(process.env.OPENAI_MAX_CONTEXT_MESSAGES, 20),
};
