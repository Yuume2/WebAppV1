# 07 — Backend Map

App: `apps/api`. Node 20+, TS strict, plain `node:http`, no framework.

## Responsibilities

- Serve JSON endpoints for the web app.
- Own sensitive state: user accounts, sessions, encrypted provider API keys, message history.
- Call external AI providers on behalf of the user (currently OpenAI).
- Enforce a uniform `ApiResponse<T>` envelope everywhere.

## Structure

```
apps/api/src
├── index.ts                       entrypoint, listen, shutdown, Sentry init
├── config/
│   └── env.ts                     parses/validates env (incl. PROVIDER_ENCRYPTION_KEY)
├── lib/
│   ├── http.ts                    envelope types + ok/fail/writeJson, HttpError
│   ├── logger.ts                  structured logger
│   ├── request-id.ts              uuid per request
│   ├── router.ts                  method+path matcher with :param
│   ├── server.ts                  buildRouter + createApiServer
│   ├── db.ts                      drizzle client factory (only constructed when DATABASE_URL set)
│   ├── cookie.ts                  cookie parse/serialize
│   ├── password.ts                bcrypt hash + verify
│   ├── session-token.ts           signed session token mint/verify
│   ├── resolve-user.ts            session-cookie → user lookup
│   ├── api-key-cipher.ts          AES-256-GCM encrypt/decrypt provider keys
│   ├── rate-limiter.ts            simple in-memory rate limiter (not wired yet)
│   └── sentry.ts                  init / captureException / flush (no-op without DSN)
├── middleware/
│   ├── handle-request.ts          request pipeline + error → envelope + Sentry capture
│   └── cors.test.ts
├── routes/
│   ├── index.ts                   registers business + auth + dev routes; switches DB vs in-memory
│   ├── auth.ts                    makeAuthRoutes(deps)
│   ├── projects-db.ts             makeProjectDbRoutes(deps)
│   ├── workspaces-db.ts           makeWorkspaceDbRoutes(deps)
│   ├── chat-windows-db.ts         makeChatWindowDbRoutes(deps)
│   ├── messages-db.ts             makeMessageDbRoutes(deps)
│   ├── provider-connections.ts    makeProviderConnectionRoutes(deps)
│   ├── dev.ts                     /v1/dev/{reset,seed} — dev only
│   └── *.test.ts                  per-route vitest suites
├── controllers/
│   ├── health.controller.ts
│   ├── projects.controller.ts + projects-db.controller.ts
│   ├── workspaces.controller.ts + workspaces-db.controller.ts
│   ├── chat-windows.controller.ts + chat-windows-db.controller.ts
│   ├── messages.controller.ts + messages-db.controller.ts   (POST → OpenAI loop)
│   ├── auth.controller.ts
│   ├── provider-connections.controller.ts
│   ├── state.controller.ts + state-db.controller.ts
│   └── dev.controller.ts
├── services/                      in-memory fallback stores (no DB)
│   ├── projects.service.ts
│   ├── workspaces.service.ts
│   ├── chat-windows.service.ts
│   ├── messages.service.ts
│   └── provider-key.service.ts    in-memory key store used by legacy tests
├── db/                            drizzle repos (DB mode)
│   ├── schema.ts
│   ├── users.repo.ts
│   ├── sessions.repo.ts
│   ├── projects.repo.ts
│   ├── workspaces.repo.ts
│   ├── chat-windows.repo.ts
│   ├── messages.repo.ts
│   └── provider-connections.repo.ts
├── providers/
│   ├── provider.interface.ts      shared Provider contract
│   └── openai.provider.ts         OpenAI chat-completion adapter (30s timeout, typed errors)
├── test/
│   └── server-harness.ts          boots http.Server on ephemeral port
└── types/                         (placeholder)
```

Drizzle migrations live in `apps/api/drizzle/` (three applied: `0000_*`, `0001_*`, `0002_message_provider_metadata`).

## Request flow

1. `createApiServer()` → `http.createServer(handler)`.
2. `handleRequest(router, req, res)` reads method+URL, attaches request-id, runs CORS, calls `router.match`.
3. DB-mode controllers call `resolveUser(ctx)` to hydrate the session user, then delegate to a repo.
4. Controller returns `ApiResponse<T>`; middleware calls `writeJson`.
5. Unknown path → 404. Known path, wrong method → 405. `HttpError` → its status. Unhandled throw → 500 + `captureException`.

## DB vs in-memory toggle

`routes/index.ts` constructs the single DB handle exactly once, at module load, only when `env.databaseUrl` is set. Every business route family picks DB vs in-memory based on that handle:

- DB mode: auth + provider-connections routes present, write paths user-scoped.
- No DB: auth + provider-connections absent, write paths land in shared seeded stores (dev / MVP convenience, kept for tests).

This seam keeps the existing in-memory integration tests green while letting DB-backed tests run against the same harness with a DB handle.

## Sensitive zones

- `lib/router.ts` — path matching; change carefully. Supports `:param` segments (decoded per-segment).
- `lib/http.ts` — envelope contract; do not break shape.
- `lib/api-key-cipher.ts` — AES-GCM roundtrip. Never log plaintext keys; require `PROVIDER_ENCRYPTION_KEY` when DB is set.
- `lib/session-token.ts` + `db/sessions.repo.ts` — auth seam; invalid state here is a critical bug.
- `providers/openai.provider.ts` — external I/O, must stay behind the `Provider` interface; respect the 30s timeout.
- `middleware/handle-request.ts` — global error path; every throw must become a proper `ApiResponse` + status.

## Tests

- Vitest, integration-style via `server-harness`.
- 226 tests across 24 files as of 2026-04-24. Run: `pnpm --filter @webapp/api test`.
- DB-backed suites use an in-process fake DB harness (no Postgres required).

## Env

See `05-api-map.md` and `apps/api/.env.example`.
