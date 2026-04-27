import { describe, expect, it } from 'vitest';
import { SUPPORTED_PROVIDERS, getProviderClient, isSupportedProvider } from './registry.js';

describe('providers/registry', () => {
  it('lists openai and anthropic as supported', () => {
    expect(SUPPORTED_PROVIDERS.has('openai')).toBe(true);
    expect(SUPPORTED_PROVIDERS.has('anthropic')).toBe(true);
    expect(SUPPORTED_PROVIDERS.has('perplexity')).toBe(false);
  });

  it('isSupportedProvider mirrors the set', () => {
    expect(isSupportedProvider('openai')).toBe(true);
    expect(isSupportedProvider('anthropic')).toBe(true);
    expect(isSupportedProvider('perplexity')).toBe(false);
  });

  it('returns a client for each supported provider', () => {
    expect(getProviderClient('openai',    'k')).toBeDefined();
    expect(getProviderClient('anthropic', 'k')).toBeDefined();
  });

  it('throws for an unsupported provider', () => {
    expect(() => getProviderClient('perplexity', 'k')).toThrow();
  });
});
