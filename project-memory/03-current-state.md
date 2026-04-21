# 03 — Current State

Last verified: 2026-04-21.

## Branches

- `main` — stable, pushed.
- `feat/api-foundation` — origin has one extra commit (`de398ac` — `fix(types): add "type": "module" to fix named ESM exports under Node 24`) not yet in the integration branch. Tiny, isolated to `packages/types/package.json`.
- `feat/frontend-steps-2-5-6` — shipped to integration.
- `feat/integration-homepage-projects` — **current**, up-to-date with origin.

## Done

- Monorepo scaffold (pnpm, turbo, tsconfig base, CI stub).
- Shared types (`@webapp/types`): `Project`, `Workspace`, `ChatWindow`, `AIProvider`, `ApiError`, `ApiResponse<T>`, `HealthStatus`.
- Backend foundation: env parser, logger, request-id, Router, `handleRequest` middleware, `createApiServer`.
- Endpoints: `GET /health`, `GET /v1/health`, `GET /v1/projects` (seed store, 2 items).
- Vitest setup + 6 integration tests (health + projects) passing.
- Frontend UI: AppShell, Panel, Button; Workspace feature (sidebar, canvas, composer, toolbar); Chat feature (ChatWindow, useChatSessions); window creation with presets + inline rename.
- Frontend data boundary (`lib/data`) mocked.
- Frontend API client (`lib/api/client`, `lib/api/projects`) + homepage wired to real `GET /v1/projects` with mock fallback + source badge (`api`, `api error`, `mock data`).

## In progress

- Local uncommitted WIP in working tree on `apps/api/src/lib/http.ts` + `router.ts`: dynamic path params (`:id`). Adds `RequestContext.params` and a compiled-segment matcher to `Router`. Not staged, not stashed. Needs a feature branch + tests before landing.
- `feat/api-foundation` has a newer commit on origin (`de398ac`) not merged into the integration branch yet.

## Blocked / missing

- No DB.
- No auth.
- No provider adapters (OpenAI/Anthropic/Perplexity).
- No project detail / workspace / chat endpoints.
- No write endpoints (create/update/delete projects).
- No conversation persistence.
- Frontend project detail page uses mocks; needs API once backend serves detail + workspaces.

## Next obvious steps

1. Merge/clean up WIP param router, ship `GET /v1/projects/:id`.
2. Merge/cherry-pick `de398ac` from `feat/api-foundation` into the integration branch (ESM fix for `@webapp/types`).
3. Wire frontend project detail to real API once detail endpoint lands.
4. Decide DB + persistence story.
