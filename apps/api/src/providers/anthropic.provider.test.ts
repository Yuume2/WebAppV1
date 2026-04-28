import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAnthropicClient, verifyAnthropicKey } from './anthropic.provider.js';
import { ProviderError } from './provider.interface.js';

const MESSAGES = [{ role: 'user' as const, content: 'Hello' }];
const MODEL    = 'claude-3-5-sonnet';
const API_KEY  = 'sk-ant-test';

function ok(body: object): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
function bad(status: number, errorMessage: string): Response {
  return new Response(JSON.stringify({ error: { message: errorMessage } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('verifyAnthropicKey', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('returns ok on 200', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }));
    expect(await verifyAnthropicKey(API_KEY)).toBe('ok');
    const call = vi.mocked(fetch).mock.calls[0]!;
    const init = call[1] as RequestInit;
    expect(init.headers).toMatchObject({ 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' });
  });

  it('returns unauthorized on 401', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 401 }));
    expect(await verifyAnthropicKey(API_KEY)).toBe('unauthorized');
  });

  it('returns provider_error on network failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('boom'));
    expect(await verifyAnthropicKey(API_KEY)).toBe('provider_error');
  });

  it('passes an AbortSignal so the call cannot hang forever', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }));
    await verifyAnthropicKey(API_KEY);
    const init = vi.mocked(fetch).mock.calls[0]![1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('createAnthropicClient.createChatCompletion', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('returns normalized result with content + model + usage', async () => {
    vi.mocked(fetch).mockResolvedValue(ok({
      model: MODEL,
      content: [{ type: 'text', text: 'Hello human!' }],
      usage:   { input_tokens: 10, output_tokens: 4 },
    }));
    const r = await createAnthropicClient(API_KEY).createChatCompletion(MESSAGES, MODEL);
    expect(r.content).toBe('Hello human!');
    expect(r.model).toBe(MODEL);
    expect(r.usage).toEqual({ promptTokens: 10, completionTokens: 4, totalTokens: 14 });
  });

  it('extracts a system prompt from system-role messages and posts it separately', async () => {
    vi.mocked(fetch).mockResolvedValue(ok({
      model: MODEL,
      content: [{ type: 'text', text: 'ok' }],
      usage:   { input_tokens: 1, output_tokens: 1 },
    }));
    await createAnthropicClient(API_KEY).createChatCompletion([
      { role: 'system', content: 'You are X.' },
      { role: 'system', content: 'Style: terse.' },
      { role: 'user',   content: 'Hi' },
    ], MODEL);

    const call = vi.mocked(fetch).mock.calls[0]!;
    const init = call[1] as RequestInit;
    const body = JSON.parse(init.body as string) as { system?: string; messages: Array<{ role: string }> };
    expect(body.system).toBe('You are X.\n\nStyle: terse.');
    expect(body.messages).toEqual([{ role: 'user', content: 'Hi' }]);
  });

  it('throws ProviderError on non-2xx with the upstream message', async () => {
    vi.mocked(fetch).mockResolvedValue(bad(401, 'invalid x-api-key'));
    await expect(createAnthropicClient(API_KEY).createChatCompletion(MESSAGES, MODEL))
      .rejects.toMatchObject({ code: 'api_error' });
  });

  it('throws invalid_response when content is empty', async () => {
    vi.mocked(fetch).mockResolvedValue(ok({
      model: MODEL,
      content: [],
      usage:   { input_tokens: 1, output_tokens: 0 },
    }));
    await expect(createAnthropicClient(API_KEY).createChatCompletion(MESSAGES, MODEL))
      .rejects.toBeInstanceOf(ProviderError);
  });

  it('passes an AbortSignal so a completion call cannot hang forever', async () => {
    vi.mocked(fetch).mockResolvedValue(ok({
      model: MODEL,
      content: [{ type: 'text', text: 'ok' }],
      usage:   { input_tokens: 1, output_tokens: 1 },
    }));
    await createAnthropicClient(API_KEY).createChatCompletion(MESSAGES, MODEL);
    const init = vi.mocked(fetch).mock.calls[0]![1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('createAnthropicClient.createChatCompletionStream', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  function sse(events: string[]): Response {
    const body = events.join('') + '\n';
    const stream = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(new TextEncoder().encode(body)); c.close(); },
    });
    return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  }

  it('parses content_block_delta + message_delta + message_start', async () => {
    vi.mocked(fetch).mockResolvedValue(sse([
      `event: message_start\ndata: ${JSON.stringify({ type: 'message_start', message: { model: MODEL, usage: { input_tokens: 5, output_tokens: 0 } } })}\n\n`,
      `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi ' } })}\n\n`,
      `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'there' } })}\n\n`,
      `event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } })}\n\n`,
      `event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`,
    ]));

    const chunks = [];
    for await (const c of createAnthropicClient(API_KEY).createChatCompletionStream(MESSAGES, MODEL)) {
      chunks.push(c);
    }
    const text = chunks.filter((c) => c.type === 'delta').map((c) => c.type === 'delta' ? c.content : '').join('');
    const done = chunks.find((c) => c.type === 'done');
    expect(text).toBe('Hi there');
    if (done?.type !== 'done') throw new Error('expected done');
    expect(done.model).toBe(MODEL);
    expect(done.usage.promptTokens).toBe(5);
    expect(done.usage.completionTokens).toBe(2);
    expect(done.usage.totalTokens).toBe(7);
  });

  it('throws ProviderError on non-2xx upstream', async () => {
    vi.mocked(fetch).mockResolvedValue(bad(401, 'invalid x-api-key'));
    const it = createAnthropicClient(API_KEY).createChatCompletionStream(MESSAGES, MODEL)[Symbol.asyncIterator]();
    await expect(it.next()).rejects.toBeInstanceOf(ProviderError);
  });

  it('passes a connect-only AbortSignal to fetch', async () => {
    vi.mocked(fetch).mockResolvedValue(sse([
      `data: ${JSON.stringify({ type: 'message_stop' })}\n\n`,
    ]));
    const chunks = [];
    for await (const c of createAnthropicClient(API_KEY).createChatCompletionStream(MESSAGES, MODEL)) {
      chunks.push(c);
    }
    const init = vi.mocked(fetch).mock.calls[0]![1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
