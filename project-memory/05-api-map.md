# 05 — API Map

Base: `http://localhost:<API_PORT|4000>`. Envelope: `ApiResponse<T>` from `@webapp/types`.

## Endpoints

| Method | Path           | Controller                  | Service             | Response         |
|--------|----------------|-----------------------------|---------------------|------------------|
| GET    | /health        | healthController            | —                   | `HealthStatus`   |
| GET    | /v1/health     | healthController            | —                   | `HealthStatus`   |
| GET    | /v1/projects   | listProjectsController      | `listProjects()`    | `Project[]`      |

All responses:

```ts
{ ok: true, data: T }
| { ok: false, error: { code, message, details? } }
```

Status mapping (set by `handle-request`):
- `ok:true` → 200
- `ok:false` returned by controller → 400
- Unknown path → 404 `not_found`
- Known path, wrong method → 405 `method_not_allowed`
- Unhandled throw → 500 `internal_error`

Headers:
- `Content-Type: application/json; charset=utf-8`
- `Cache-Control: no-store`
- `X-Request-Id: <uuid>` (set by `request-id` util per request).

## File map

- Routes registry: `apps/api/src/routes/index.ts`
- Controllers: `apps/api/src/controllers/*.controller.ts`
- Services: `apps/api/src/services/*.service.ts`
- Envelope helpers (`ok`, `fail`, `writeJson`): `apps/api/src/lib/http.ts`
- Router: `apps/api/src/lib/router.ts` (literal paths only; param support WIP stashed)
- Middleware: `apps/api/src/middleware/handle-request.ts`
- Env parser: `apps/api/src/config/env.ts`
- Server factory: `apps/api/src/lib/server.ts`
- Test harness: `apps/api/src/test/server-harness.ts`
- Route tests: `apps/api/src/routes/*.test.ts`, `apps/api/src/middleware/handle-request.test.ts`

## How to add a route

1. Add controller in `apps/api/src/controllers/`.
2. Add service if it touches data.
3. Register in `apps/api/src/routes/index.ts`.
4. Add a vitest using `server-harness`.
5. Update this file.

## Domain types used by the API

From `@webapp/types`:

- `Project` = `{ id, name, description?, createdAt, updatedAt }`
- `Workspace` = `{ id, projectId, name, windowIds, createdAt, updatedAt }`
- `ChatWindow` = `{ id, workspaceId, title, provider, model, createdAt, updatedAt }`
- `AIProvider` = `'openai' | 'anthropic' | 'perplexity'`

## Backend env

- `API_PORT` (default 4000)
- `NODE_ENV` (`development` | `production` | `test`)
- `API_VERSION` (default `0.1.0`)
