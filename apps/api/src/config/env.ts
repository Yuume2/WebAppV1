export interface ApiEnv {
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
  serviceVersion: string;
  corsOrigin: string;
  maxBodyBytes: number;
  enableDevEndpoints: boolean;
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

const nodeEnv = parseNodeEnv(process.env.NODE_ENV);

export const env: ApiEnv = {
  port: parsePort(process.env.API_PORT, 4000),
  nodeEnv,
  serviceVersion: process.env.API_VERSION ?? '0.1.0',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  maxBodyBytes: parseMaxBodyBytes(process.env.API_MAX_BODY_BYTES, 100 * 1024),
  enableDevEndpoints: process.env.ENABLE_DEV_ENDPOINTS !== undefined
    ? process.env.ENABLE_DEV_ENDPOINTS === 'true'
    : nodeEnv !== 'production',
};
