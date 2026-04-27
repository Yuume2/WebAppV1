import { describe, expect, it } from 'vitest';
import { SUPPORTED_PROVIDERS, getProviderClient, isSupportedProvider } from './registry.js';

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
});
