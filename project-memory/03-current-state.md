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
- `feat/web-project-detail-api` — pushed. `/project/[id]` wired to real detail endpoint with mock fallback + error panel + source badge.
- `feat/api-project-workspaces` — pushed. `GET /v1/projects/:id/workspaces` + seeded store (ids aligned with web mocks) + 3 new tests (13 total, all green).
- `feat/web-project-workspaces-api` — pushed. `/project/[id]` workspaces fetched from real API with mock fallback + dual source badges (project + workspaces) + workspaces error panel. **Integrated** into `feat/integration-homepage-projects` on 2026-04-22 (fast-forward).
- `feat/integration-homepage-projects` — **current**. Fast-forwarded to tip of `feat/web-project-workspaces-api`. Carries everything: GET projects, GET projects/:id, GET projects/:id/workspaces, web wiring + mock fallback + badges. Tests green (13/13). Build green. Ready to open a PR against `main`.
- `origin/feat/api-foundation` — **parallel unmerged V1 track, 53 commits ahead of our integration branch** (last: `de398ac`). Contains a different, much larger V1: Postgres+Drizzle migrations, auth (signup/login/logout/me, session cookies), encrypted provider-connection storage, OpenAI provider adapter, live key test, rate limiting, `/v1/state`, full CRUD, per-user scoping, atomic message persistence, web 3-column layout, dev seed/reset toolbar. **Architecturally incompatible** with the mock-fallback track — uses `/v1/state` and auth cookies, not per-resource reads with mock fallback. No decision made on which track wins.

## Done

- Monorepo scaffold (pnpm, turbo, tsconfig base, CI stub).
- Shared types (`@webapp/types`): `Project`, `Workspace`, `ChatWindow`, `AIProvider`, `ApiError`, `ApiResponse<T>`, `HealthStatus`.
- Backend foundation: env parser, logger, request-id, Router, `handleRequest` middleware, `createApiServer`.
- Endpoints: `GET /health`, `GET /v1/health`, `GET /v1/projects`, `GET /v1/projects/:id`, `GET /v1/projects/:id/workspaces` (seed stores).
- Vitest setup + 13 integration tests passing (health + projects list + projects detail + project workspaces + dispatch errors).
- `HttpError` class in `lib/http.ts`: status-bearing throws → middleware converts to `ApiResponse` envelope.
- Param router: `:id` compiled segments, `RouteMatch { handler, params }`, `ctx.params` frozen.
- Frontend UI: AppShell, Panel, Button; Workspace feature (sidebar, canvas, composer, toolbar); Chat feature (ChatWindow, useChatSessions); window creation with presets + inline rename.
- Frontend data boundary (`lib/data`) mocked.
- Frontend API client (`lib/api/client`, `lib/api/projects`) + homepage wired to real `GET /v1/projects` with mock fallback + source badge (`api`, `api error`, `mock data`).

## In progress

- **Track decision pending.** Two V1 paths exist:
  - Track A (our line): read-only mock-fallback UI, small backend. `feat/integration-homepage-projects` now carries the full A work and is PR-ready against `main`.
  - Track B: `origin/feat/api-foundation` — full DB+auth+provider V1, unmerged, unmentioned in prior memory, not yet verified by this session.
- PRs **not opened** (no `gh` CLI): integration → `main`, and the 4 feature branches landed into integration are now redundant (but kept for history).

## Blocked / missing

- No DB.
- No auth.
- No provider adapters (OpenAI/Anthropic/Perplexity).
- No project detail / workspace / chat endpoints.
- No write endpoints (create/update/delete projects).
- No conversation persistence.
- Frontend project detail page now calls `GET /v1/projects/:id` and `GET /v1/projects/:id/workspaces` (with mock fallback). Windows still mock-only (no endpoint).

## Next obvious steps

1. **Decide the V1 track with Yume** before coding more. Track A (integration branch) is ready to PR. Track B (`feat/api-foundation`) is a bigger V1 already built but in parallel — needs evaluation, not just a merge.
2. If Track A wins: open PR `feat/integration-homepage-projects` → `main`, then design windows endpoint + frontend wiring to drop the last mock.
3. If Track B wins: review `feat/api-foundation`, confirm it runs locally (needs Postgres via `docker-compose`), decide fate of Track A commits (archive or port useful pieces), rebase memory around Track B reality.
