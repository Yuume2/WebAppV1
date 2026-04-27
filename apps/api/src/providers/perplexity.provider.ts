import type {
  ChatCompletionResult,
  ChatCompletionStreamChunk,
  ChatMessage,
  ProviderClient,
} from './provider.interface.js';
import { ProviderError } from './provider.interface.js';

// Perplexity is OpenAI-compatible at the chat-completions schema level.
// We post the same shape and parse the same response, with a different base URL
// and model namespace ('sonar', 'sonar-pro', ...).

const PERPLEXITY_CHAT_URL = 'https://api.perplexity.ai/chat/completions';

// Used by verifyPerplexityKey: smallest possible completion that the API will
// accept just to confirm the bearer token is valid. Non-streaming, max_tokens=1.
const VERIFY_MODEL = 'sonar';

// ── Key verification ──────────────────────────────────────────────────────────

export type PerplexityVerifyResult = 'ok' | 'unauthorized' | 'provider_error';

export async function verifyPerplexityKey(apiKey: string): Promise<PerplexityVerifyResult> {
  let res: Response;
  try {
    res = await fetch(PERPLEXITY_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: VERIFY_MODEL,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        stream: false,
      }),
    });
  } catch {
    return 'provider_error';
  }
  if (res.ok)              return 'ok';
  if (res.status === 401)  return 'unauthorized';
  if (res.status === 403)  return 'unauthorized';
  return 'provider_error';
}

// ── Wire types ────────────────────────────────────────────────────────────────

interface PerplexityUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface PerplexityMessage {
  role: string;
  content: string | null;
}

interface PerplexityChoice {
  message?: PerplexityMessage;
  delta?:   { content?: string };
  finish_reason?: string;
}

interface PerplexityResponse {
  model: string;
  choices: PerplexityChoice[];
  usage:   PerplexityUsage;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createPerplexityClient(apiKey: string): ProviderClient {
  return {
    async createChatCompletion(
      messages: ChatMessage[],
      model: string,
    ): Promise<ChatCompletionResult> {
      let res: Response;
      try {
        res = await fetch(PERPLEXITY_CHAT_URL, {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ model, messages, stream: false }),
        });
      } catch (err) {
        throw new ProviderError(
          `Perplexity request failed: ${(err as Error).message}`,
          'api_error',
          'perplexity',
        );
      }

      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const body = (await res.json()) as { error?: { message?: string } };
          if (typeof body?.error?.message === 'string') detail = body.error.message;
        } catch { /* ignore */ }
        throw new ProviderError(`Perplexity API error: ${detail}`, 'api_error', 'perplexity');
      }

      let data: PerplexityResponse;
      try {
        data = (await res.json()) as PerplexityResponse;
      } catch {
        throw new ProviderError('Failed to parse Perplexity response', 'invalid_response', 'perplexity');
      }

      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.length === 0) {
        throw new ProviderError('Perplexity response missing content', 'invalid_response', 'perplexity');
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

    async *createChatCompletionStream(
      messages: ChatMessage[],
      model: string,
    ): AsyncIterable<ChatCompletionStreamChunk> {
      let res: Response;
      try {
        res = await fetch(PERPLEXITY_CHAT_URL, {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'Accept':        'text/event-stream',
          },
          body: JSON.stringify({ model, messages, stream: true }),
        });
      } catch (err) {
        throw new ProviderError(
          `Perplexity request failed: ${(err as Error).message}`,
          'api_error',
          'perplexity',
        );
      }

      if (!res.ok || !res.body) {
        let detail = `HTTP ${res.status}`;
        try {
          const body = (await res.json()) as { error?: { message?: string } };
          if (typeof body?.error?.message === 'string') detail = body.error.message;
        } catch { /* ignore */ }
        throw new ProviderError(`Perplexity API error: ${detail}`, 'api_error', 'perplexity');
      }

      const decoder = new TextDecoder();
      let buf = '';
      let finalModel = model;
      let usage: ChatCompletionResult['usage'] = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

      const reader = res.body.getReader();
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          let idx;
          while ((idx = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 1);
            if (line === '' || !line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (payload === '[DONE]') continue;

            let event: PerplexityResponse;
            try {
              event = JSON.parse(payload) as PerplexityResponse;
            } catch {
              throw new ProviderError('Failed to parse Perplexity stream chunk', 'invalid_response', 'perplexity');
            }
            if (event.model) finalModel = event.model;
            if (event.usage) {
              usage = {
                promptTokens:     event.usage.prompt_tokens     ?? usage.promptTokens,
                completionTokens: event.usage.completion_tokens ?? usage.completionTokens,
                totalTokens:      event.usage.total_tokens      ?? usage.totalTokens,
              };
            }
            const delta = event.choices?.[0]?.delta?.content;
            if (typeof delta === 'string' && delta.length > 0) {
              yield { type: 'delta', content: delta };
            }
          }
        }
      } finally {
        try { reader.releaseLock(); } catch { /* ignore */ }
      }

      yield { type: 'done', model: finalModel, usage };
    },
  };
}
