import type { ChatCompletionResult, ChatMessage, ProviderClient } from './provider.interface.js';
import { ProviderError } from './provider.interface.js';

// ── Key verification ──────────────────────────────────────────────────────────

export type OpenAIVerifyResult = 'ok' | 'unauthorized' | 'provider_error';

const OPENAI_MODELS_URL = 'https://api.openai.com/v1/models';

export async function verifyOpenAIKey(apiKey: string): Promise<OpenAIVerifyResult> {
  let res: Response;
  try {
    res = await fetch(OPENAI_MODELS_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch {
    return 'provider_error';
  }
  if (res.status === 200) return 'ok';
  if (res.status === 401) return 'unauthorized';
  return 'provider_error';
}

// ── OpenAI wire types (subset of actual response) ─────────────────────────────

interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface OpenAIMessage {
  role: string;
  content: string | null;
}

interface OpenAIChoice {
  message: OpenAIMessage;
  finish_reason: string;
}

interface OpenAIResponse {
  model: string;
  choices: OpenAIChoice[];
  usage: OpenAIUsage;
}

// ── Factory ───────────────────────────────────────────────────────────────────

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';

export function createOpenAIClient(apiKey: string): ProviderClient {
  return {
    async createChatCompletion(
      messages: ChatMessage[],
      model: string,
    ): Promise<ChatCompletionResult> {
      let res: Response;
      try {
        res = await fetch(OPENAI_CHAT_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ model, messages, stream: false }),
        });
      } catch (err) {
        throw new ProviderError(
          `OpenAI request failed: ${(err as Error).message}`,
          'api_error',
          'openai',
        );
      }

      if (!res.ok) {
        // Attempt to surface the API error message without leaking the key.
        let detail = `HTTP ${res.status}`;
        try {
          const body = (await res.json()) as { error?: { message?: string } };
          if (typeof body?.error?.message === 'string') {
            detail = body.error.message;
          }
        } catch {
          // ignore parse failure
        }
        throw new ProviderError(
          `OpenAI API error: ${detail}`,
          'api_error',
          'openai',
        );
      }

      let data: OpenAIResponse;
      try {
        data = (await res.json()) as OpenAIResponse;
      } catch {
        throw new ProviderError('Failed to parse OpenAI response', 'invalid_response', 'openai');
      }

      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        throw new ProviderError('OpenAI response missing content', 'invalid_response', 'openai');
      }

      return {
        content,
        model: data.model ?? model,
        usage: {
          promptTokens:     data.usage?.prompt_tokens     ?? 0,
          completionTokens: data.usage?.completion_tokens ?? 0,
          totalTokens:      data.usage?.total_tokens      ?? 0,
        },
      };
    },
  };
}
