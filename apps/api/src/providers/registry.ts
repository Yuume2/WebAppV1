import type { AIProvider } from '@webapp/types';
import type { ProviderClient } from './provider.interface.js';
import { createOpenAIClient,    verifyOpenAIKey,    type OpenAIVerifyResult }    from './openai.provider.js';
import { createAnthropicClient, verifyAnthropicKey, type AnthropicVerifyResult } from './anthropic.provider.js';

export type VerifyResult = OpenAIVerifyResult | AnthropicVerifyResult; // identical union shape today

/** Providers that have a working adapter. Single source of truth for upserts and chat-window creation. */
export const SUPPORTED_PROVIDERS: ReadonlySet<AIProvider> = new Set(['openai', 'anthropic']);

export function isSupportedProvider(p: AIProvider): boolean {
  return SUPPORTED_PROVIDERS.has(p);
}

export function getProviderClient(provider: AIProvider, apiKey: string): ProviderClient {
  switch (provider) {
    case 'openai':    return createOpenAIClient(apiKey);
    case 'anthropic': return createAnthropicClient(apiKey);
    default:
      throw new Error(`No provider client for '${provider}'`);
  }
}

export function verifyProviderKey(provider: AIProvider, apiKey: string): Promise<VerifyResult> {
  switch (provider) {
    case 'openai':    return verifyOpenAIKey(apiKey);
    case 'anthropic': return verifyAnthropicKey(apiKey);
    default:
      return Promise.resolve('provider_error');
  }
}
