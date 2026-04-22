# 03 — Current State

Last verified: 2026-04-22.

## Branches

- `main` — stable.
- `feat/integration-homepage-projects` — **current, pushed**. Tip `5708b9a`. Carries the full Track A surface read path: projects list + detail + workspaces + windows + messages, all wired end-to-end with mock fallback. Tests 19/19 green. Typecheck green. Web build green.
- Feature branches merged into integration (kept for history, now redundant):
  - `feat/api-project-detail`
  - `feat/web-project-detail-api`
  - `feat/api-project-workspaces`
  - `feat/web-project-workspaces-api`
  - `feat/api-workspace-windows` (merged `97418e0`)
  - `feat/api-window-messages` (merged `5708b9a`)
- `origin/feat/api-foundation` — parallel Track B (DB+auth+OpenAI V1), 53+ commits ahead, **unmerged, not evaluated this session**. Architecturally incompatible with Track A. Decision deferred.

## Done (Track A, read-only V1 read path)

- Monorepo scaffold (pnpm, turbo, tsconfig base).
- Shared types `@webapp/types`: `Project`, `Workspace`, `ChatWindow`, `Message`, `MessageRole`, `AIProvider`, `ApiError`, `ApiResponse<T>`, `HealthStatus`.
- Backend foundation: env, logger, request-id, param router (`:id`), `handleRequest` middleware, `HttpError`, `createApiServer`.
- Endpoints (all GET):
  - `/health`, `/v1/health`
  - `/v1/projects`
  - `/v1/projects/:id`
  - `/v1/projects/:id/workspaces`
  - `/v1/workspaces/:id/windows`
  - `/v1/windows/:id/messages`
- Seed stores aligned across backend + web mocks (proj-1/2, ws-1/1b/2, win-1..7, m-1..10).
- Vitest: 19 integration tests green.
- Frontend UI: AppShell/Panel/Button, Workspace feature (canvas/sidebar/composer), Chat feature (ChatWindow, useChatSessions), presets, inline rename.
- Frontend API clients: `lib/api/{client,env,projects,workspaces,windows,messages}`.
- Homepage `/` wired to `GET /v1/projects` (mock fallback + source badge).
- Project detail `/project/[id]`:
  - Project: `fetchProject` + mock fallback + 404 error panel + source badge.
  - Workspaces: `fetchProjectWorkspaces` + mock fallback + workspaces source badge + error panel.
  - Windows: `fetchWorkspaceWindows` + mock fallback when workspaces came from mock or on error.
  - Messages: `fetchWindowMessages` per active window, parallel `Promise.all`, mock fallback per window on error.

## In progress

- PR `feat/integration-homepage-projects` → `main` not yet opened (no `gh` CLI, must be manual).

## Blocked / missing (to call V1 "ready to show")

- Surface `windows` and `messages` source badges inside rendered `Workspace` view (needs a `headerRight` slot on `Workspace` component). Cosmetic.
- No write endpoints (create/update project/workspace/window, POST message). All reads only.
- No real provider call (OpenAI/Anthropic/Perplexity) — chat input stays local state.
- No DB, no auth, no persistence, no rate limiting.
- `apps/api/README.md` and `CONTRIBUTING.md` are 1-line stubs.
- CI typecheck/lint/test still have `|| echo …` fallbacks.
- Track B decision still pending.

## Next obvious step

Open PR `feat/integration-homepage-projects` → `main` (manual). Tree is in a coherent read-only V1 state.
