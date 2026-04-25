# @webapp/api

Minimal Node.js + TypeScript backend for AI Workspace V1.

## Purpose

Server-side API — auth, provider proxying, persistence. No HTTP framework yet; stdlib `http` server with an internal router. Framework choice deferred until features require it.

## Structure

- `src/index.ts` — entry, server bootstrap, graceful shutdown
- `src/config/env.ts` — parsed & validated env
- `src/routes/` — route definitions (method + path + handler)
- `src/controllers/` — request handlers, one per concern
- `src/services/` — domain logic (empty until features land)
- `src/middleware/` — request pipeline (dispatch, error envelope, logging)
- `src/lib/` — internal utilities (router, http helpers, logger, request id)
- `src/types/` — backend-only types (shared contracts live in `@webapp/types`)

## Response envelope

All JSON responses follow `ApiResponse<T>` from `@webapp/types`:

```ts
{ ok: true,  data: T }
{ ok: false, error: { code: string; message: string; details?: unknown } }
```

Every response sets `X-Request-Id`.

## Endpoints

| Method | Path             | Description                       |
| ------ | ---------------- | --------------------------------- |
| GET    | `/health`        | Service health + uptime           |
| GET    | `/v1/health`     | Same, under versioned prefix      |
| GET    | `/v1/projects`   | Readonly list of projects         |

## Dev

```bash
pnpm --filter @webapp/api dev
curl -i http://localhost:4000/health
curl -i http://localhost:4000/v1/projects
```

## Tests

```bash
pnpm --filter @webapp/api test
```

Vitest spins up the real server on an ephemeral port per suite and asserts on the envelope, headers, and error paths.

The suite runs green without `DATABASE_URL` (DB repos are mocked per test). To also exercise the DB-backed path locally — applying drizzle migrations against a real Postgres before running tests — export `DATABASE_URL` (see `## Local Postgres (DB mode)` below) and run `pnpm --filter @webapp/api db:migrate` once, then `pnpm --filter @webapp/api test`. CI runs this variant in the `api-db-tests` job.

### AI smoke (manual)

End-to-end check of the full chat flow against a running API and a real OpenAI account:

```bash
# 1. API up + Postgres up + migrations applied (see "Local Postgres" below).
# 2. apps/api/.env contains OPENAI_API_KEY (loaded automatically).
pnpm api:smoke:ai
# or equivalently:
pnpm --filter @webapp/api smoke:ai
```

The script signs up a fresh user, creates a project / workspace / chat-window, upserts the OpenAI key, posts a message "hello", and asserts an assistant reply was persisted. It **never logs the key value**. Missing `OPENAI_API_KEY` fails fast with a clear message.

This script is **not** wired into CI: it spends real OpenAI tokens and assumes a live API on `http://localhost:4000`. Override the target with `SMOKE_API_BASE_URL=…` or the model with `SMOKE_MODEL=…`.

## Env vars

Canonical template: [`apps/api/.env.example`](./.env.example). Copy it to `apps/api/.env` (or export the vars in your shell) and tweak values as needed. `pnpm --filter @webapp/api dev` auto-loads `apps/api/.env` when it exists (via `--env-file-if-exists`); shell-exported vars still win because Node's `--env-file*` flags don't override existing process env. The table below documents each variable.

| Name                          | Default        | Notes                                                                                  |
| ----------------------------- | -------------- | -------------------------------------------------------------------------------------- |
| `API_PORT`                    | `4000`         | 1–65535                                                                                |
| `NODE_ENV`                    | `development`  | `development` \| `production` \| `test`                                                |
| `API_VERSION`                 | `0.1.0`        | Reported by `/health`                                                                  |
| `DATABASE_URL`                | *(unset)*      | Enables DB-backed routes. Unset = in-memory fallback.                                  |
| `PROVIDER_ENCRYPTION_KEY`     | *(unset)*      | **Required when `DATABASE_URL` is set.** 64-char hex (32 bytes).                        |
| `CORS_ORIGIN`                 | `*`            | Set to an explicit origin (e.g. `http://localhost:3000`) when `DATABASE_URL` is on.    |
| `API_MAX_BODY_BYTES`          | `102400`       | POST body cap in bytes.                                                                |
| `OPENAI_MAX_CONTEXT_MESSAGES` | `20`           | Prior messages sent to the provider per call.                                          |
| `ENABLE_DEV_ENDPOINTS`        | `true` in dev  | `/v1/dev` helpers gated on this.                                                       |
| `SENTRY_DSN_API`              | *(unset)*      | Error capture disabled when empty.                                                     |

Generate a provider encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Local Postgres (DB mode)

A `docker-compose.yml` at the repo root ships a `postgres:16` service preconfigured for dev.

```bash
# 1. Start Postgres (detached)
docker compose up -d postgres

# 2. Export env (db + encryption key required together)
export DATABASE_URL="postgres://webapp:webapp@localhost:5432/webapp"
export PROVIDER_ENCRYPTION_KEY="$(node -e 'console.log(require(\"crypto\").randomBytes(32).toString(\"hex\"))')"

# 3. Apply migrations
pnpm --filter @webapp/api db:migrate

# 4. Run the API
pnpm --filter @webapp/api dev

# 5. Smoke test
curl -i http://localhost:4000/v1/health
```

Stop the DB with `docker compose down` (preserves the volume) or `docker compose down -v` (drops data).

### Fallback — in-memory mode

With `DATABASE_URL` **unset**, the API still boots and serves the in-memory route set (`projects`, `workspaces`, `chat-windows`, `messages` as frozen seed data). Use this for frontend-only work that doesn't need auth or persistence.

```bash
unset DATABASE_URL
pnpm --filter @webapp/api dev
curl -i http://localhost:4000/v1/health
```

The startup log prints which mode is active.
