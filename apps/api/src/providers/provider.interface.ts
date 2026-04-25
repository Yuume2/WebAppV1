// ── Shared message shape ──────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// ── Normalized result — provider-agnostic ─────────────────────────────────────

export interface ChatCompletionResult {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// ── Streaming chunk ───────────────────────────────────────────────────────────

export type ChatCompletionStreamChunk =
  | { type: 'delta'; content: string }
  | { type: 'done'; model: string; usage: ChatCompletionResult['usage'] };

// ── Provider client contract ──────────────────────────────────────────────────

export interface ProviderClient {
  createChatCompletion(
    messages: ChatMessage[],
    model: string,
  ): Promise<ChatCompletionResult>;

  createChatCompletionStream(
    messages: ChatMessage[],
    model: string,
  ): AsyncIterable<ChatCompletionStreamChunk>;
}

// ── Typed error ───────────────────────────────────────────────────────────────

export type ProviderErrorCode = 'not_configured' | 'api_error' | 'invalid_response';

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly provider: string;

  constructor(message: string, code: ProviderErrorCode, provider: string) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.provider = provider;
  }
}
