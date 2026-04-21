import { describe, expect, it, vi } from 'vitest';
import { requireProviderApiKey } from './provider-key.service.js';
import { ProviderError } from '../providers/provider.interface.js';

vi.mock('../db/provider-connections.repo.js', () => ({
  getDecryptedApiKey: vi.fn(),
}));

import { getDecryptedApiKey } from '../db/provider-connections.repo.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

// db is not used directly — getDecryptedApiKey is mocked at module level.
const mockDb = {} as Parameters<typeof requireProviderApiKey>[0];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('requireProviderApiKey', () => {
  it('returns the decrypted key when a connection exists', async () => {
    vi.mocked(getDecryptedApiKey).mockResolvedValue('sk-decrypted-test');

    const key = await requireProviderApiKey(mockDb, 'user-1', 'openai');
    expect(key).toBe('sk-decrypted-test');
    expect(getDecryptedApiKey).toHaveBeenCalledWith(mockDb, 'user-1', 'openai');
  });

  it('throws ProviderError with code not_configured when no connection exists', async () => {
    vi.mocked(getDecryptedApiKey).mockResolvedValue(null);

    await expect(requireProviderApiKey(mockDb, 'user-1', 'openai')).rejects.toThrow(ProviderError);

    try {
      await requireProviderApiKey(mockDb, 'user-1', 'openai');
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderError);
      expect((err as ProviderError).code).toBe('not_configured');
      expect((err as ProviderError).provider).toBe('openai');
    }
  });

  it('throws ProviderError naming the correct provider', async () => {
    vi.mocked(getDecryptedApiKey).mockResolvedValue(null);

    await expect(requireProviderApiKey(mockDb, 'user-1', 'anthropic')).rejects.toMatchObject({
      code: 'not_configured',
      provider: 'anthropic',
    });
  });

  it('does not include the key value in an error when key is missing', async () => {
    vi.mocked(getDecryptedApiKey).mockResolvedValue(null);

    try {
      await requireProviderApiKey(mockDb, 'user-2', 'openai');
    } catch (err) {
      // Error message must not contain a raw API key (there is none, but also no internal token)
      expect((err as ProviderError).message).not.toContain('sk-');
    }
  });
});
