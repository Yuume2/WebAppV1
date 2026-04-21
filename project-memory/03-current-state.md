# 03 — Current State

Last verified: 2026-04-21.

> Update (2026-04-21, later): WIP param router landed on `feat/api-project-detail`.
> `GET /v1/projects/:id` + `HttpError` + tests added. 10/10 API tests pass.

## Branches

- `main` — stable, pushed.
- `feat/api-foundation` — origin has one extra commit (`de398ac` — `fix(types): add "type": "module" to fix named ESM exports under Node 24`) not yet in the integration branch. Tiny, isolated to `packages/types/package.json`.
- `feat/frontend-steps-2-5-6` — shipped to integration.
- `feat/integration-homepage-projects` — up-to-date with origin.
- `feat/api-project-detail` — pushed to origin. Param router + `GET /v1/projects/:id` + `HttpError`.
- `feat/web-project-detail-api` — **current**. `/project/[id]` wired to real detail endpoint with mock fallback + error panel + source badge.

## Done

- Monorepo scaffold (pnpm, turbo, tsconfig base, CI stub).
- Shared types (`@webapp/types`): `Project`, `Workspace`, `ChatWindow`, `AIProvider`, `ApiError`, `ApiResponse<T>`, `HealthStatus`.
- Backend foundation: env parser, logger, request-id, Router, `handleRequest` middleware, `createApiServer`.
- Endpoints: `GET /health`, `GET /v1/health`, `GET /v1/projects`, `GET /v1/projects/:id` (seed store, 2 items).
- Vitest setup + 10 integration tests passing (health + projects list + projects detail + dispatch errors).
- `HttpError` class in `lib/http.ts`: status-bearing throws → middleware converts to `ApiResponse` envelope.
- Param router: `:id` compiled segments, `RouteMatch { handler, params }`, `ctx.params` frozen.
- Frontend UI: AppShell, Panel, Button; Workspace feature (sidebar, canvas, composer, toolbar); Chat feature (ChatWindow, useChatSessions); window creation with presets + inline rename.
- Frontend data boundary (`lib/data`) mocked.
- Frontend API client (`lib/api/client`, `lib/api/projects`) + homepage wired to real `GET /v1/projects` with mock fallback + source badge (`api`, `api error`, `mock data`).

## In progress

- `feat/api-foundation` has a newer commit on origin (`de398ac`) not merged into the integration branch yet.
- `feat/api-project-detail` not yet pushed; needs PR into `feat/integration-homepage-projects` (or `main`).

## Blocked / missing

- No DB.
- No auth.
- No provider adapters (OpenAI/Anthropic/Perplexity).
- No project detail / workspace / chat endpoints.
- No write endpoints (create/update/delete projects).
- No conversation persistence.
- Frontend project detail page now calls `GET /v1/projects/:id`. Workspaces/windows still from mocks — needs a `GET /v1/projects/:id/workspaces` endpoint.

## Next obvious steps

1. Merge/clean up WIP param router, ship `GET /v1/projects/:id`.
2. Merge/cherry-pick `de398ac` from `feat/api-foundation` into the integration branch (ESM fix for `@webapp/types`).
3. Wire frontend project detail to real API once detail endpoint lands.
4. Decide DB + persistence story.
