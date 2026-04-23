# ADR 0004 — Playwright: scaffold only, real scenarios deferred

- **Status:** Accepted — scaffold in this PR, real UI scenarios in wave 2
- **Date:** 2026-04-23
- **Deciders:** X (tech lead)

## Context

`apps/api` has solid Vitest coverage over the real HTTP surface (see
`src/test/server-harness.ts`). `apps/web` has **zero** tests. The product-level
golden path (signup → connect provider → create workspace → send message)
crosses both apps and is therefore not covered by anything today.

Playwright is the right tool for that golden path. But writing DOM selectors
against a frontend that is still being reshaped produces brittle tests that
block PRs for reasons unrelated to the change under review.

## Decision

Ship a **minimal Playwright scaffold** now, with a single smoke test that hits
`GET /health` over HTTP — no browser, no UI, no selectors. This proves the
scaffold is sound (install, config, CI job) and gives wave 2 a zero-day start.

Real UI scenarios are written in wave 2, once the frontend has been stable for
two consecutive weeks.

## Scaffold shape

- Workspace: `apps/e2e/` (picked up by the existing `apps/*` glob in
  `pnpm-workspace.yaml`).
- Dependency: `@playwright/test` only. **No browsers installed** — the smoke
  test uses Playwright's `request` fixture.
- One file: `apps/e2e/tests/smoke.spec.ts`.
- CI job `e2e-smoke`, `continue-on-error: true`. Non-blocking until wave 2.

## Consequences

- Tiny blast radius. No `apps/web/src/**` or `apps/api/src/**` change.
- When wave 2 lands, it adds files under `apps/e2e/tests/` and optionally
  installs chromium; it does not have to re-argue the scaffold.
- The CI job stays green even if someone deletes the smoke test by accident
  (`continue-on-error: true`), so a broken scaffold cannot block `main`.

## Rejected alternatives

- **Cypress** — heavier install, no first-class `request`-only mode without a
  browser, and no reason to differ from the rest of the Node toolchain.
- **Wait until wave 2 to even scaffold** — leaves wave 2 with install + config
  + CI + first test all in one PR, which is exactly the kind of batch we want
  to avoid.
