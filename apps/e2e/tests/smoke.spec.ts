import { test, expect } from '@playwright/test';

/**
 * Smoke test — scaffold only.
 *
 * Hits the API `/health` endpoint over HTTP. No browser, no UI assertions.
 * Real UI scenarios (auth, provider-connect, chat-send) land in wave 2.
 * See docs/technical/adr/0004-playwright-scaffold-only.md
 */
test('API /health returns a healthy envelope', async ({ request }) => {
  const res = await request.get('/health');

  expect(res.status()).toBe(200);

  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.data).toBeTruthy();
});
