import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPerplexityClient, verifyPerplexityKey } from './perplexity.provider.js';
import { ProviderError } from './provider.interface.js';

const MESSAGES = [{ role: 'user' as const, content: 'Hello' }];
const MODEL    = 'sonar';
const API_KEY  = 'pplx-test';

function ok(body: object): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
function bad(status: number, msg: string): Response {
  return new Response(JSON.stringify({ error: { message: msg } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('verifyPerplexityKey', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('returns ok on 2xx', async () => {
    vi.mocked(fetch).mockResolvedValue(ok({ choices: [{ message: { role: 'assistant', content: '' } }] }));
    expect(await verifyPerplexityKey(API_KEY)).toBe('ok');
    const init = vi.mocked(fetch).mock.calls[0]![1] as RequestInit;
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${API_KEY}` });
  });

  it('returns unauthorized on 401', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 401 }));
    expect(await verifyPerplexityKey(API_KEY)).toBe('unauthorized');
  });

  it('returns unauthorized on 403', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 403 }));
    expect(await verifyPerplexityKey(API_KEY)).toBe('unauthorized');
  });

  it('returns provider_error on network failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('boom'));
    expect(await verifyPerplexityKey(API_KEY)).toBe('provider_error');
  });

  it('passes an AbortSignal so the call cannot hang forever', async () => {
    vi.mocked(fetch).mockResolvedValue(ok({ choices: [{ message: { role: 'assistant', content: '' } }] }));
    await verifyPerplexityKey(API_KEY);
    const init = vi.mocked(fetch).mock.calls[0]![1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('createPerplexityClient.createChatCompletion', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('returns normalized result with content + model + usage', async () => {
    vi.mocked(fetch).mockResolvedValue(ok({
      model: MODEL,
      choices: [{ message: { role: 'assistant', content: 'Hello!' }, finish_reason: 'stop' }],
      usage:   { prompt_tokens: 7, completion_tokens: 2, total_tokens: 9 },
    }));
    const r = await createPerplexityClient(API_KEY).createChatCompletion(MESSAGES, MODEL);
    expect(r.content).toBe('Hello!');
    expect(r.model).toBe(MODEL);
    expect(r.usage).toEqual({ promptTokens: 7, completionTokens: 2, totalTokens: 9 });
  });

  it('throws ProviderError on non-2xx with the upstream message', async () => {
    vi.mocked(fetch).mockResolvedValue(bad(401, 'invalid bearer token'));
    await expect(createPerplexityClient(API_KEY).createChatCompletion(MESSAGES, MODEL))
      .rejects.toMatchObject({ code: 'api_error' });
  });

  it('throws invalid_response when content is empty', async () => {
    vi.mocked(fetch).mockResolvedValue(ok({
      model: MODEL,
      choices: [{ message: { role: 'assistant', content: '' } }],
      usage:   { prompt_tokens: 1, completion_tokens: 0, total_tokens: 1 },
    }));
    await expect(createPerplexityClient(API_KEY).createChatCompletion(MESSAGES, MODEL))
      .rejects.toBeInstanceOf(ProviderError);
  });

  it('passes an AbortSignal so a completion call cannot hang forever', async () => {
    vi.mocked(fetch).mockResolvedValue(ok({
      model: MODEL,
      choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
      usage:   { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }));
    await createPerplexityClient(API_KEY).createChatCompletion(MESSAGES, MODEL);
    const init = vi.mocked(fetch).mock.calls[0]![1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('createPerplexityClient.createChatCompletionStream', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  function sse(payloads: string[]): Response {
    const body = payloads.map((p) => `data: ${p}\n\n`).join('') + 'data: [DONE]\n\n';
    const stream = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(new TextEncoder().encode(body)); c.close(); },
    });
    return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  }

  it('parses delta + final chunk with usage', async () => {
    vi.mocked(fetch).mockResolvedValue(sse([
      JSON.stringify({ model: MODEL, choices: [{ delta: { content: 'Hi ' } }] }),
      JSON.stringify({ model: MODEL, choices: [{ delta: { content: 'there' } }] }),
      JSON.stringify({ model: MODEL, choices: [{ delta: {} }], usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 } }),
    ]));

    const chunks = [];
    for await (const c of createPerplexityClient(API_KEY).createChatCompletionStream(MESSAGES, MODEL)) {
      chunks.push(c);
    }
    const text = chunks.filter((c) => c.type === 'delta').map((c) => c.type === 'delta' ? c.content : '').join('');
    const done = chunks.find((c) => c.type === 'done');
    expect(text).toBe('Hi there');
    if (done?.type !== 'done') throw new Error('expected done');
    expect(done.usage.promptTokens).toBe(4);
    expect(done.usage.completionTokens).toBe(2);
    expect(done.usage.totalTokens).toBe(6);
    expect(done.model).toBe(MODEL);
  });

  it('throws ProviderError on non-2xx upstream', async () => {
    vi.mocked(fetch).mockResolvedValue(bad(401, 'bad key'));
    const it = createPerplexityClient(API_KEY).createChatCompletionStream(MESSAGES, MODEL)[Symbol.asyncIterator]();
    await expect(it.next()).rejects.toBeInstanceOf(ProviderError);
  });

  it('passes a connect-only AbortSignal to fetch', async () => {
    vi.mocked(fetch).mockResolvedValue(sse([
      JSON.stringify({ model: MODEL, choices: [{ delta: {} }], usage: { prompt_tokens: 1, completion_tokens: 0, total_tokens: 1 } }),
    ]));
    const chunks = [];
    for await (const c of createPerplexityClient(API_KEY).createChatCompletionStream(MESSAGES, MODEL)) {
      chunks.push(c);
    }
    const init = vi.mocked(fetch).mock.calls[0]![1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
