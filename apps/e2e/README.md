# @webapp/e2e

End-to-end test scaffold. **Scaffold only** — real UI scenarios land in wave 2
of `docs/technical/tooling-roadmap.md`.

## What is here today

- `playwright.config.ts` — minimal config, no browser project.
- `tests/smoke.spec.ts` — hits `GET /health` over HTTP using Playwright's
  `request` fixture. No browser binary needed.

## Run locally

```bash
# 1. Start the API in another terminal
pnpm --filter @webapp/api dev

# 2. Run the smoke test
pnpm --filter @webapp/e2e test
```

Override the target with `E2E_API_URL=http://host:port pnpm -F @webapp/e2e test`.

## CI

Runs in the `e2e-smoke` job of `.github/workflows/ci.yml` with
`continue-on-error: true`. Non-blocking until wave 2.

## Wave 2

Wave 2 will add:

- Chromium install step in CI.
- `tests/auth.spec.ts`, `tests/provider-connect.spec.ts`, `tests/chat-send.spec.ts`.
- Remove `continue-on-error` once green on `main` twice in a row.

See `docs/technical/adr/0004-playwright-scaffold-only.md`.
