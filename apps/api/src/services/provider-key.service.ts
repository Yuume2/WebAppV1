import type { AIProvider } from '@webapp/types';
import { getDecryptedApiKey, type Db } from '../db/provider-connections.repo.js';
import { ProviderError } from '../providers/provider.interface.js';

/**
 * Returns the decrypted API key for the given user+provider pair.
 * Throws ProviderError('not_configured') if no connection exists.
 * This is internal server-side only — the key must never be forwarded to clients.
 */
export async function requireProviderApiKey(
  db: Db,
  userId: string,
  provider: AIProvider,
): Promise<string> {
  const key = await getDecryptedApiKey(db, userId, provider);
  if (!key) {
    throw new ProviderError(
      `No ${provider} connection configured for this account`,
      'not_configured',
      provider,
    );
  }
  return key;
}
