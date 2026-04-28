import type {
  ChatCompletionResult,
  ChatCompletionStreamChunk,
  ChatMessage,
  ProviderClient,
} from './provider.interface.js';
import { ProviderError } from './provider.interface.js';

// ── Endpoints ─────────────────────────────────────────────────────────────────

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODELS_URL   = 'https://api.anthropic.com/v1/models';
const ANTHROPIC_VERSION      = '2023-06-01';

/** Default cap when no per-call value is supplied. Anthropic requires max_tokens. */
const DEFAULT_MAX_TOKENS = 1024;

// ── Key verification ──────────────────────────────────────────────────────────

export type AnthropicVerifyResult = 'ok' | 'unauthorized' | 'provider_error';

const VERIFY_TIMEOUT_MS         = 10_000;
const RUNTIME_TIMEOUT_MS        = 60_000;
const STREAM_CONNECT_TIMEOUT_MS = 30_000;

export async function verifyAnthropicKey(apiKey: string): Promise<AnthropicVerifyResult> {
  let res: Response;
  try {
    res = await fetch(ANTHROPIC_MODELS_URL, {
      method: 'GET',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
  } catch {
    return 'provider_error';
  }
  if (res.status === 200) return 'ok';
  if (res.status === 401) return 'unauthorized';
  return 'provider_error';
}

// ── Helpers: split a generic ChatMessage[] into Anthropic's shape ─────────────

interface AnthropicShape {
  system: string | undefined;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

function toAnthropicShape(messages: ChatMessage[]): AnthropicShape {
  const systemParts: string[] = [];
  const out: AnthropicShape['messages'] = [];
  for (const m of messages) {
    if (m.role === 'system') systemParts.push(m.content);
    else                     out.push({ role: m.role, content: m.content });
  }
  return {
    system:   systemParts.length === 0 ? undefined : systemParts.join('\n\n'),
    messages: out,
  };
}

// ── Wire types (subset) ───────────────────────────────────────────────────────

interface AnthropicTextBlock { type: 'text'; text: string }
interface AnthropicResponse {
  model: string;
  content: AnthropicTextBlock[];
  usage:   { input_tokens: number; output_tokens: number };
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createAnthropicClient(apiKey: string): ProviderClient {
  return {
    async createChatCompletion(
      messages: ChatMessage[],
      model: string,
    ): Promise<ChatCompletionResult> {
      const shape = toAnthropicShape(messages);

      let res: Response;
      try {
        res = await fetch(ANTHROPIC_MESSAGES_URL, {
          method: 'POST',
          headers: {
            'Content-Type':      'application/json',
            'x-api-key':         apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
          },
          body: JSON.stringify({
            model,
            max_tokens: DEFAULT_MAX_TOKENS,
            ...(shape.system ? { system: shape.system } : {}),
            messages: shape.messages,
            stream: false,
          }),
          signal: AbortSignal.timeout(RUNTIME_TIMEOUT_MS),
        });
      } catch (err) {
        throw new ProviderError(
          `Anthropic request failed: ${(err as Error).message}`,
          'api_error',
          'anthropic',
        );
      }

      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const body = (await res.json()) as { error?: { message?: string } };
          if (typeof body?.error?.message === 'string') detail = body.error.message;
        } catch { /* ignore */ }
        throw new ProviderError(`Anthropic API error: ${detail}`, 'api_error', 'anthropic');
      }

      let data: AnthropicResponse;
      try {
        data = (await res.json()) as AnthropicResponse;
      } catch {
        throw new ProviderError('Failed to parse Anthropic response', 'invalid_response', 'anthropic');
      }

      const text = data.content
        ?.filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('');
      if (!text || text.length === 0) {
        throw new ProviderError('Anthropic response missing text content', 'invalid_response', 'anthropic');
      }

      return {
        content: text,
        model:   data.model ?? model,
        usage:   {
          promptTokens:     data.usage?.input_tokens  ?? 0,
          completionTokens: data.usage?.output_tokens ?? 0,
          totalTokens:      (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
        },
      };
    },

    async *createChatCompletionStream(
      messages: ChatMessage[],
      model: string,
    ): AsyncIterable<ChatCompletionStreamChunk> {
      const shape = toAnthropicShape(messages);

      const connectController = new AbortController();
      const connectTimer = setTimeout(() => connectController.abort(), STREAM_CONNECT_TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(ANTHROPIC_MESSAGES_URL, {
          method: 'POST',
          headers: {
            'Content-Type':      'application/json',
            'Accept':            'text/event-stream',
            'x-api-key':         apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
          },
          body: JSON.stringify({
            model,
            max_tokens: DEFAULT_MAX_TOKENS,
            ...(shape.system ? { system: shape.system } : {}),
            messages: shape.messages,
            stream: true,
          }),
          signal: connectController.signal,
        });
      } catch (err) {
        throw new ProviderError(
          `Anthropic request failed: ${(err as Error).message}`,
          'api_error',
          'anthropic',
        );
      } finally {
        clearTimeout(connectTimer);
      }

      if (!res.ok || !res.body) {
        let detail = `HTTP ${res.status}`;
        try {
          const body = (await res.json()) as { error?: { message?: string } };
          if (typeof body?.error?.message === 'string') detail = body.error.message;
        } catch { /* ignore */ }
        throw new ProviderError(`Anthropic API error: ${detail}`, 'api_error', 'anthropic');
      }

      const decoder = new TextDecoder();
      let buf = '';
      let finalModel = model;
      let promptTokens = 0;
      let completionTokens = 0;

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
            // Anthropic SSE has both "event: <name>" and "data: <json>" lines.
            // Only "data:" carries the payload we care about — every event has
            // a discriminating "type" inside the JSON, so we can ignore the
            // event: line entirely.
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (payload === '' || payload === '[DONE]') continue;

            let event: {
              type?: string;
              message?: { model?: string; usage?: { input_tokens?: number; output_tokens?: number } };
              delta?: { text?: string; type?: string; stop_reason?: string };
              usage?: { input_tokens?: number; output_tokens?: number };
            };
            try {
              event = JSON.parse(payload);
            } catch {
              throw new ProviderError('Failed to parse Anthropic stream chunk', 'invalid_response', 'anthropic');
            }

            switch (event.type) {
              case 'message_start': {
                if (event.message?.model) finalModel = event.message.model;
                if (event.message?.usage?.input_tokens !== undefined) {
                  promptTokens = event.message.usage.input_tokens;
                }
                break;
              }
              case 'content_block_delta': {
                const text = event.delta?.text;
                if (typeof text === 'string' && text.length > 0) {
                  yield { type: 'delta', content: text };
                }
                break;
              }
              case 'message_delta': {
                if (event.usage?.output_tokens !== undefined) {
                  completionTokens = event.usage.output_tokens;
                }
                break;
              }
              default:
                // message_stop, ping, content_block_start/stop — no-op
                break;
            }
          }
        }
      } finally {
        try { reader.releaseLock(); } catch { /* ignore */ }
      }

      yield {
        type: 'done',
        model: finalModel,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
      };
    },
  };
}
