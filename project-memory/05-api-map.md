# 05 — API Map

Base: `http://localhost:<API_PORT|4000>`. Envelope: `ApiResponse<T>` from `@webapp/types`.

All business routes except health exist in two modes:
- **DB mode** (when `DATABASE_URL` is set): user-scoped, auth-required (session cookie), backed by drizzle repos.
- **In-memory fallback** (no DB): same paths, seeded stores, no auth, no provider-connections, no auth endpoints.

Path constants live in `@webapp/types` (`API_*_PATH`).

## Endpoints

### Health

| Method | Path         | Response       |
|--------|--------------|----------------|
| GET    | /health      | `HealthStatus` |
| GET    | /v1/health   | `HealthStatus` |

### Projects (`API_PROJECTS_PATH = /v1/projects`)

| Method | Path                 | Auth (DB mode) | Body / returns                  |
|--------|----------------------|----------------|---------------------------------|
| GET    | /v1/projects         | session        | `Project[]`                     |
| POST   | /v1/projects         | session        | `CreateProjectDto` → `Project`  |
| GET    | /v1/projects/:id     | session        | `Project` (404 `not_found`)     |

### Workspaces (`API_WORKSPACES_PATH = /v1/workspaces`)

| Method | Path                    | Returns                                |
|--------|-------------------------|----------------------------------------|
| GET    | /v1/workspaces          | `Workspace[]` (`?projectId` filter)    |
| POST   | /v1/workspaces          | `Workspace`                            |
| GET    | /v1/workspaces/:id      | `Workspace`                            |

### Chat windows (`API_CHAT_WINDOWS_PATH = /v1/chat-windows`)

| Method | Path                       | Returns                                   |
|--------|----------------------------|-------------------------------------------|
| GET    | /v1/chat-windows           | `ChatWindow[]` (`?workspaceId` filter)    |
| POST   | /v1/chat-windows           | `ChatWindow`                              |
| GET    | /v1/chat-windows/:id       | `ChatWindow`                              |

### Messages (`API_MESSAGES_PATH = /v1/messages`)

| Method | Path                   | Returns                                  |
|--------|------------------------|------------------------------------------|
| GET    | /v1/messages           | `Message[]` (`?chatWindowId` filter)     |
| POST   | /v1/messages           | `Message` — user msg persisted + OpenAI call + assistant msg persisted. `412` when no provider. Timeout 30s. |
| GET    | /v1/messages/:id       | `Message`                                |

### Legacy read aliases (kept until web migrates to canonical paths — #38)

| Method | Path                                | Rewrites to                                  |
|--------|-------------------------------------|----------------------------------------------|
| GET    | /v1/workspaces/:id/windows          | `GET /v1/chat-windows?workspaceId=:id`       |
| GET    | /v1/windows/:id/messages            | `GET /v1/messages?chatWindowId=:id`          |

### Auth (DB mode only)

| Method | Path                 | Body                        | Returns / effect                        |
|--------|----------------------|-----------------------------|-----------------------------------------|
| POST   | /v1/auth/signup      | `AuthSignupDto`             | sets session cookie, `AuthMe`           |
| POST   | /v1/auth/login       | `AuthLoginDto`              | sets session cookie, `AuthMe`           |
| POST   | /v1/auth/logout      | —                           | clears session cookie                   |
| GET    | /v1/auth/me          | —                           | `AuthMe` or 401                         |

### Provider connections (DB mode only, auth-required, `API_PROVIDER_CONNECTIONS_PATH = /v1/provider-connections`)

| Method | Path                                        | Body                             | Effect                                         |
|--------|---------------------------------------------|----------------------------------|------------------------------------------------|
| GET    | /v1/provider-connections                    | —                                | `ProviderConnectionMetadata[]` (no secrets)    |
| GET    | /v1/provider-connections/:provider          | —                                | `ProviderConnectionMetadata`                   |
| PUT    | /v1/provider-connections/:provider          | `UpsertProviderConnectionDto`    | encrypts + stores API key                      |
| DELETE | /v1/provider-connections/:provider          | —                                | removes connection                             |
| POST   | /v1/provider-connections/openai/test        | —                                | live ping OpenAI with stored key               |

### State

| Method | Path         | Returns                                           |
|--------|--------------|---------------------------------------------------|
| GET    | /v1/state    | `{ projects, workspaces, chatWindows, messages }` bootstrap snapshot (user-scoped in DB mode) |

### Dev (only when `ENABLE_DEV_ENDPOINTS=true`)

| Method | Path               | Effect                                            |
|--------|--------------------|---------------------------------------------------|
| POST   | /v1/dev/reset      | resets in-memory stores / dev DB fixtures         |
| POST   | /v1/dev/seed       | reseeds dev fixtures                              |

## Envelope

```ts
{ ok: true, data: T }
| { ok: false, error: { code: ApiErrorCode, message: string, details?: unknown } }
```

`ApiErrorCode` includes: `bad_request`, `unauthorized`, `forbidden`, `not_found`, `conflict`, `validation_error`, `method_not_allowed`, `internal_error`, `provider_error`, `provider_auth_error`, `provider_not_configured` (backlog — #57).

Status mapping (via `middleware/handle-request`):
- `ok:true` → 200
- Controller `HttpError` → its status + `fail(code, message)`
- Unknown path → 404 `not_found`
- Known path, wrong method → 405 `method_not_allowed`
- Unhandled throw → 500 `internal_error` (also fed to Sentry if configured)

Headers:
- `Content-Type: application/json; charset=utf-8`
- `Cache-Control: no-store`
- `X-Request-Id: <uuid>`
- CORS headers per `CORS_ORIGIN`; cookies when session middleware authenticates.

## File map

- Routes registry: `apps/api/src/routes/index.ts` (toggles DB vs in-memory at module load).
- Route modules: `apps/api/src/routes/{auth,projects-db,workspaces-db,chat-windows-db,messages-db,provider-connections,dev}.ts`.
- Controllers: `apps/api/src/controllers/*.controller.ts` (paired `*-db.controller.ts` for DB mode).
- Services (in-memory fallback): `apps/api/src/services/*.service.ts`.
- Repos (DB mode): `apps/api/src/db/*.repo.ts` + `db/schema.ts`.
- Envelope helpers: `apps/api/src/lib/http.ts` (`ok`, `fail`, `writeJson`, `HttpError`).
- Router: `apps/api/src/lib/router.ts`.
- DB factory: `apps/api/src/lib/db.ts`.
- Auth primitives: `apps/api/src/lib/{cookie,password,session-token,resolve-user}.ts`.
- Cipher: `apps/api/src/lib/api-key-cipher.ts`.
- Sentry wrapper: `apps/api/src/lib/sentry.ts`.
- Test harness: `apps/api/src/test/server-harness.ts`.

## How to add a route

1. Controller in `controllers/` (pair a `*-db.controller.ts` when user-scoping).
2. For DB mode add a repo in `db/` or reuse one.
3. Register in a dedicated `routes/<thing>.ts` (or inline in `routes/index.ts` for trivial ones) and wire from `routes/index.ts`.
4. Add vitest via `server-harness` (DB-mode tests use an in-process fake DB).
5. Update this file.

## Backend env (see `apps/api/.env.example` for full list)

- `API_PORT`, `NODE_ENV`, `API_VERSION`
- `CORS_ORIGIN`, `API_MAX_BODY_BYTES`, `ENABLE_DEV_ENDPOINTS`
- `DATABASE_URL` (switches on DB mode)
- `PROVIDER_ENCRYPTION_KEY` (required when DB is set — 32-byte hex)
- `OPENAI_MAX_CONTEXT_MESSAGES`
- `SENTRY_DSN_API`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`
