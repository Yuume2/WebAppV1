# 03 — Current State

Last verified: 2026-04-24 (post PR #6 merge; reflects `main` at `9b45cf3`).

## Branches

- `main` — truth. Tip `9b45cf3`. Track A + Track B now merged. DB-gated write path, auth, provider-connections, Sentry, drizzle migrations.
- `origin/feat/api-foundation` — archival, superseded by the Track B merge (PR #6, commit `f46f599`).
- Historical integration branches (merged or abandoned) should not be read as active.

Active work is tracked in the GitHub Project (project #1, `Yuume2/WebAppV1`), not here. See `04-active-tasks.md`.

## Done (shipped to main)

**Monorepo / tooling**
- pnpm workspaces + Turborepo, TS strict, Node 20+.
- Shared types `@webapp/types`: read models + write-path DTOs (auth, projects, workspaces, chat-windows, messages, provider-connections) + `ApiError` / `ApiResponse<T>` / `ApiErrorCode` + path constants (`API_*_PATH`).
- `.env.example` for `apps/api` and `apps/web` committed (#54).
- docker-compose Postgres + local bootstrap docs (#51).
- Drizzle migrations + workflow (#50).
- Issue + PR templates matching label taxonomy (#49).
- Project-status automation CLI + `pnpm project:status:*` (#56).
- GitHub→Notion Tasks sync (#48).

**Backend (`apps/api`)**
- Plain `node:http` server, custom router with `:param` segments, `handleRequest` middleware, `HttpError`, uniform `ApiResponse<T>` envelope.
- Endpoints (canonical): `/v1/health`, `/v1/projects`, `/v1/workspaces`, `/v1/chat-windows`, `/v1/messages` (GET + POST + `:id` GET), `/v1/provider-connections` (GET/PUT/DELETE + `/openai/test`), `/v1/auth/{signup,login,logout,me}`, `/v1/state`, legacy alias reads (`/v1/workspaces/:id/windows`, `/v1/windows/:id/messages`), dev `/v1/dev/{reset,seed}`.
- DB-gated mode: when `DATABASE_URL` is set, all business routes are user-scoped DB-backed. Without it, in-memory fallback (seeded) powers the same surface minus auth + provider-connections.
- Auth: signup/login/logout + session cookie + `/v1/auth/me`, bcrypt password hashing, signed session tokens. Repos: `users.repo`, `sessions.repo`.
- Provider-connections: AES-256-GCM at-rest encryption of API keys (`api-key-cipher`), per-user CRUD, OpenAI test endpoint.
- OpenAI provider: POST `/v1/messages` runs the chat-completion loop, 30s timeout, 412 when no provider configured, typed error codes (`provider_error`, `provider_auth_error`, etc.).
- Sentry wired (`lib/sentry.ts`, no-op when DSN absent).
- Vitest: 226 tests green (24 files). Run `pnpm --filter @webapp/api test`.

**Frontend (`apps/web`)**
- Next.js 15 App Router. Routes: `/` (projects list), `/project/[id]` (workspaces + windows + messages read).
- API clients read-only against legacy paths (`lib/api/{projects,workspaces,windows,messages}`). No POST/PUT/DELETE clients yet.
- No auth UI, no provider-settings UI, no write actions — still local state + mock fallback for the render layer.

## In progress

Tracked in GitHub Project #1. As of 2026-04-24 22:30:
- #21 (this memory refresh).
- #55 open PR — provider message loop hardening (merged content already in main; PR itself pending close).

## Blocked / missing (to ship a usable MVP)

- Web has no write clients — create/rename/delete flows for projects/workspaces/windows/messages all still local. Issues #19/#20/#28/#36/#38.
- No login/register pages (#16) or session guard (#17). Auth backend is ready.
- No provider-settings UI (#18/#36/#37). Backend CRUD + test endpoint ready.
- CI still has `|| echo …` fallbacks (#43). Lint/typecheck/test not real gates.
- `apps/api/README.md` / `CONTRIBUTING.md` still thin (#47).
- Provider adapters beyond OpenAI (Anthropic #14, Perplexity #33) not started.

## Next obvious step

Pick the highest-priority Ready issue from GitHub Project #1. Backend foundation is complete enough that the next unlock is either (a) write-path web clients, or (b) the auth UI pages.
