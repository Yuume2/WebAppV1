import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOpenAIClient } from './openai.provider.js';
import { ProviderError } from './provider.interface.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const MESSAGES = [{ role: 'user' as const, content: 'Hello' }];
const MODEL    = 'gpt-4o-mini';
const API_KEY  = 'sk-test-key';

function makeOkResponse(body: object): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeErrorResponse(status: number, errorMessage: string): Response {
  return new Response(JSON.stringify({ error: { message: errorMessage } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function openAIBody(content: string, model = MODEL) {
  return {
    model,
    choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage:   { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createOpenAIClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('createChatCompletion — success', () => {
    it('returns normalized result with content, model, and usage', async () => {
      vi.mocked(fetch).mockResolvedValue(makeOkResponse(openAIBody('Hello back!')));

      const client = createOpenAIClient(API_KEY);
      const result = await client.createChatCompletion(MESSAGES, MODEL);

      expect(result.content).toBe('Hello back!');
      expect(result.model).toBe(MODEL);
      expect(result.usage.promptTokens).toBe(10);
      expect(result.usage.completionTokens).toBe(20);
      expect(result.usage.totalTokens).toBe(30);
    });

    it('sends correct Authorization header and JSON body', async () => {
      vi.mocked(fetch).mockResolvedValue(makeOkResponse(openAIBody('ok')));

      const client = createOpenAIClient(API_KEY);
      await client.createChatCompletion(MESSAGES, MODEL);

      const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.openai.com/v1/chat/completions');
      expect((init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${API_KEY}`);

      const body = JSON.parse(init.body as string) as { model: string; messages: unknown[]; stream: boolean };
      expect(body.model).toBe(MODEL);
      expect(body.messages).toEqual(MESSAGES);
      expect(body.stream).toBe(false);
    });

    it('uses the model returned by the API (may differ from requested)', async () => {
      vi.mocked(fetch).mockResolvedValue(makeOkResponse(openAIBody('ok', 'gpt-4o-2024-11-20')));

      const client = createOpenAIClient(API_KEY);
      const result = await client.createChatCompletion(MESSAGES, MODEL);
      expect(result.model).toBe('gpt-4o-2024-11-20');
    });
  });

  describe('createChatCompletion — API errors', () => {
    it('throws ProviderError with code api_error on 401', async () => {
      vi.mocked(fetch).mockResolvedValue(makeErrorResponse(401, 'Invalid API key'));

      const client = createOpenAIClient(API_KEY);
      await expect(client.createChatCompletion(MESSAGES, MODEL)).rejects.toThrow(ProviderError);

      try {
        await client.createChatCompletion(MESSAGES, MODEL);
      } catch (err) {
        expect(err).toBeInstanceOf(ProviderError);
        expect((err as ProviderError).code).toBe('api_error');
        expect((err as ProviderError).provider).toBe('openai');
        // key must not appear in error message
        expect((err as ProviderError).message).not.toContain(API_KEY);
      }
    });

    it('throws ProviderError with code api_error on 429', async () => {
      vi.mocked(fetch).mockResolvedValue(makeErrorResponse(429, 'Rate limit exceeded'));

      const client = createOpenAIClient(API_KEY);
      await expect(client.createChatCompletion(MESSAGES, MODEL)).rejects.toMatchObject({
        code: 'api_error',
        provider: 'openai',
      });
    });

    it('throws ProviderError with code api_error on network failure', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'));

      const client = createOpenAIClient(API_KEY);
      await expect(client.createChatCompletion(MESSAGES, MODEL)).rejects.toMatchObject({
        code: 'api_error',
        provider: 'openai',
      });
    });
  });

  describe('createChatCompletion — invalid response', () => {
    it('throws ProviderError with code invalid_response when content is missing', async () => {
      const bad = { model: MODEL, choices: [{ message: { role: 'assistant', content: null }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } };
      vi.mocked(fetch).mockResolvedValue(makeOkResponse(bad));

      const client = createOpenAIClient(API_KEY);
      await expect(client.createChatCompletion(MESSAGES, MODEL)).rejects.toMatchObject({
        code: 'invalid_response',
        provider: 'openai',
      });
    });

    it('throws ProviderError with code invalid_response when choices is empty', async () => {
      const bad = { model: MODEL, choices: [], usage: { prompt_tokens: 1, completion_tokens: 0, total_tokens: 1 } };
      vi.mocked(fetch).mockResolvedValue(makeOkResponse(bad));

      const client = createOpenAIClient(API_KEY);
      await expect(client.createChatCompletion(MESSAGES, MODEL)).rejects.toMatchObject({
        code: 'invalid_response',
      });
    });
  });

  describe('createChatCompletionStream', () => {
    function sseStream(payloads: string[]): Response {
      const body = payloads.map((p) => `data: ${p}\n\n`).join('') + 'data: [DONE]\n\n';
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(body));
          controller.close();
        },
      });
      return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }

    it('yields delta + done chunks parsed from SSE', async () => {
      vi.mocked(fetch).mockResolvedValue(sseStream([
        JSON.stringify({ model: MODEL, choices: [{ delta: { content: 'Hi ' } }] }),
        JSON.stringify({ model: MODEL, choices: [{ delta: { content: 'there' } }] }),
        JSON.stringify({ model: MODEL, choices: [{ delta: {} }], usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 } }),
      ]));

      const chunks = [];
      for await (const c of createOpenAIClient(API_KEY).createChatCompletionStream(MESSAGES, MODEL)) {
        chunks.push(c);
      }
      const deltas = chunks.filter((c) => c.type === 'delta').map((c) => c.type === 'delta' ? c.content : '');
      const done   = chunks.find((c) => c.type === 'done');
      expect(deltas.join('')).toBe('Hi there');
      expect(done).toBeTruthy();
      if (done?.type !== 'done') throw new Error('expected done');
      expect(done.usage.promptTokens).toBe(4);
      expect(done.usage.completionTokens).toBe(2);
      expect(done.model).toBe(MODEL);
    });

    it('throws ProviderError when upstream returns non-2xx', async () => {
      vi.mocked(fetch).mockResolvedValue(makeErrorResponse(401, 'Invalid key'));

      const it = createOpenAIClient(API_KEY).createChatCompletionStream(MESSAGES, MODEL)[Symbol.asyncIterator]();
      await expect(it.next()).rejects.toBeInstanceOf(ProviderError);
    });
  });
});
