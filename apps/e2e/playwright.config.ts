import { defineConfig } from '@playwright/test';

/**
 * Minimal Playwright scaffold. Wave 1 uses only the `request` fixture
 * (no browser). Wave 2 will add a `chromium` project and UI specs.
 *
 * The API URL can be overridden with E2E_API_URL. Defaults match the
 * local dev server booted by `pnpm --filter @webapp/api dev`.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 15_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'list' : 'list',
  use: {
    baseURL: process.env.E2E_API_URL ?? 'http://localhost:4000',
    extraHTTPHeaders: {
      Accept: 'application/json',
    },
  },
});
