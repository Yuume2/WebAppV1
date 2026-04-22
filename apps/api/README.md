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

## Env vars

| Name           | Default       | Notes                              |
| -------------- | ------------- | ---------------------------------- |
| `API_PORT`     | `4000`        | 1–65535                            |
| `NODE_ENV`     | `development` | `development` \| `production` \| `test` |
| `API_VERSION`  | `0.1.0`       | Reported by `/health`              |
