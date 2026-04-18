export interface ApiEnv {
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
  serviceVersion: string;
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

export const env: ApiEnv = {
  port: parsePort(process.env.API_PORT, 4000),
  nodeEnv: parseNodeEnv(process.env.NODE_ENV),
  serviceVersion: process.env.API_VERSION ?? '0.1.0',
};
