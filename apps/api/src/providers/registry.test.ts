import { describe, expect, it } from 'vitest';
import type { AIProvider } from '@webapp/types';
import {
  SUPPORTED_PROVIDERS,
  getProviderClient,
  isSupportedProvider,
  verifyProviderKey,
} from './registry.js';

describe('providers/registry', () => {
  it('lists openai, anthropic and perplexity as supported', () => {
    expect(SUPPORTED_PROVIDERS.has('openai')).toBe(true);
    expect(SUPPORTED_PROVIDERS.has('anthropic')).toBe(true);
    expect(SUPPORTED_PROVIDERS.has('perplexity')).toBe(true);
  });

  it('isSupportedProvider mirrors the set', () => {
    expect(isSupportedProvider('openai')).toBe(true);
    expect(isSupportedProvider('anthropic')).toBe(true);
    expect(isSupportedProvider('perplexity')).toBe(true);
  });

  it('returns a client for each supported provider', () => {
    expect(getProviderClient('openai',     'k')).toBeDefined();
    expect(getProviderClient('anthropic',  'k')).toBeDefined();
    expect(getProviderClient('perplexity', 'k')).toBeDefined();
  });

  it('getProviderClient throws on an unknown provider — matches isSupportedProvider', () => {
    // The string is forced through the AIProvider type to exercise the
    // exhaustiveness fallthrough. If a new entry is added to the union
    // without a switch arm, this test still passes — but isSupportedProvider
    // would still report true and tip off the gap. Pin the fallback throw.
    const bogus = 'bogus' as unknown as AIProvider;
    expect(() => getProviderClient(bogus, 'k')).toThrow(/No provider client/);
    expect(isSupportedProvider(bogus)).toBe(false);
  });

  it('verifyProviderKey returns "provider_error" for an unknown provider', async () => {
    // Fallback path: a misconfigured provider should NOT crash the verify
    // endpoint. It should resolve to the same 'provider_error' code that
    // a real provider would return on a transient network blip, so the
    // controller can handle both with one code path.
    const bogus = 'bogus' as unknown as AIProvider;
    await expect(verifyProviderKey(bogus, 'k')).resolves.toBe('provider_error');
  });
});
