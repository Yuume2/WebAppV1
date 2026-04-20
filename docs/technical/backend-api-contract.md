# Backend API contract

Base URL: `http://localhost:4000`

All types referenced here are exported from `@webapp/types`.

All responses follow `ApiResponse<T>`:

```ts
{ ok: true,  data: T }
{ ok: false, error: ApiError }  // ApiErrorResponse
```

Every response sets `X-Request-Id` (UUID).

---

## CORS

All routes return:

```
Access-Control-Allow-Origin: * (overridable via CORS_ORIGIN env)
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

`OPTIONS` requests → 204 with no body.

---

## In-memory state

State is held in memory and resets on server restart. No database yet.

Two projects are seeded on startup: `proj-1` (Research Sprint) and `proj-2` (Content Pipeline).

---

## List ordering guarantee

All list endpoints (`GET /v1/projects`, `/v1/workspaces`, `/v1/chat-windows`, `/v1/messages`) and `/v1/state` collections return items sorted:

1. `createdAt` **ascending** (ISO string comparison)
2. `id` **ascending** as a stable tie-breaker when `createdAt` values are equal

This guarantee is deterministic regardless of insertion timing or engine. Frontend must not assume any other order.

---

## Canonical route surface

| Rule | Value |
|------|-------|
| Base URL | `http://localhost:4000` |
| Health endpoint | `GET /health` — **no `/v1` prefix** |
| All business endpoints | `GET /v1/<resource>` and `POST /v1/<resource>` |
| Get by id | `GET /v1/<resource>/:id` |
| No unversioned aliases for business routes | `/projects`, `/workspaces`, etc. do not exist |

---

## Shared types reference (`@webapp/types`)

| Category       | Exported names                                                              |
|----------------|-----------------------------------------------------------------------------|
| Domain         | `Project`, `Workspace`, `ChatWindow`, `Message`                             |
| Primitives     | `AIProvider`, `MessageRole`, `ISODateString`                                |
| POST payloads  | `CreateProjectInput`, `CreateWorkspaceInput`, `CreateChatWindowInput`, `CreateMessageInput` |
| State          | `AppState`                                                                  |
| Responses      | `ProjectResponse`, `ProjectListResponse`, `WorkspaceResponse`, `WorkspaceListResponse`, `ChatWindowResponse`, `ChatWindowListResponse`, `MessageResponse`, `MessageListResponse`, `StateResponse` |
| Errors         | `ApiError`, `ApiResponse<T>`, `ApiErrorResponse`                            |

---

## Naming canonical decision

**`chatWindowId`** is the canonical field name for referencing a `ChatWindow`.

- `Message.chatWindowId` — the parent window of a message
- `GET /v1/messages?chatWindowId=` — filter messages by window
- `POST /v1/messages` body → `chatWindowId`

Frontend must use `chatWindowId`. **Do not use `windowId`.**

---

## Endpoints

### GET /health — unversioned, no `/v1` prefix

```
200 { ok: true, data: HealthStatus }
```

---

### GET /v1/projects → `ProjectListResponse`

```
200 { ok: true, data: Project[] }
```

### GET /v1/projects/:id → `ProjectResponse`

```
200 { ok: true,  data: Project }
404 ApiErrorResponse  (code: 'not_found')
```

### POST /v1/projects → `ProjectResponse`

**Body:** `CreateProjectInput` = `{ name: string; description?: string }`

```
201 { ok: true,  data: Project }
400 ApiErrorResponse  (code: 'validation_error' | 'invalid_json')
```

---

### GET /v1/workspaces?projectId= → `WorkspaceListResponse`

**Query:** `projectId` required

```
200 { ok: true,  data: Workspace[] }
400 ApiErrorResponse  (code: 'validation_error')
```

### GET /v1/workspaces/:id → `WorkspaceResponse`

```
200 { ok: true,  data: Workspace }
404 ApiErrorResponse  (code: 'not_found')
```

### POST /v1/workspaces → `WorkspaceResponse`

**Body:** `CreateWorkspaceInput` = `{ projectId: string; name: string }`

```
201 { ok: true,  data: Workspace }
400 ApiErrorResponse  (code: 'validation_error' | 'invalid_json')
404 ApiErrorResponse  (code: 'not_found')   ← projectId missing
```

---

### GET /v1/chat-windows?workspaceId= → `ChatWindowListResponse`

**Query:** `workspaceId` required

```
200 { ok: true,  data: ChatWindow[] }
400 ApiErrorResponse  (code: 'validation_error')
```

### GET /v1/chat-windows/:id → `ChatWindowResponse`

```
200 { ok: true,  data: ChatWindow }
404 ApiErrorResponse  (code: 'not_found')
```

### POST /v1/chat-windows → `ChatWindowResponse`

**Body:** `CreateChatWindowInput` = `{ workspaceId: string; title: string; provider: AIProvider; model: string }`

`provider` must be one of: `openai` | `anthropic` | `perplexity`

```
201 { ok: true,  data: ChatWindow }
400 ApiErrorResponse  (code: 'validation_error' | 'invalid_json')
404 ApiErrorResponse  (code: 'not_found')   ← workspaceId missing
```

Side effect: created window's `id` is appended to `workspace.windowIds`.

---

### GET /v1/messages?chatWindowId= → `MessageListResponse`

**Query:** `chatWindowId` required

```
200 { ok: true,  data: Message[] }
400 ApiErrorResponse  (code: 'validation_error')
```

### GET /v1/messages/:id → `MessageResponse`

```
200 { ok: true,  data: Message }
404 ApiErrorResponse  (code: 'not_found')
```

### POST /v1/messages → `MessageResponse`

**Body:** `CreateMessageInput` = `{ chatWindowId: string; role: MessageRole; content: string }`

`role` must be one of: `user` | `assistant` | `system`

```
201 { ok: true,  data: Message }
400 ApiErrorResponse  (code: 'validation_error' | 'invalid_json')
404 ApiErrorResponse  (code: 'not_found')   ← chatWindowId missing
```

---

### GET /v1/state → `StateResponse`

Full snapshot. Data shape: `AppState`.

```
200 { ok: true, data: AppState }
// AppState = { projects: Project[]; workspaces: Workspace[]; chatWindows: ChatWindow[]; messages: Message[] }
```

---

---

## Dev-only endpoints

> **These endpoints exist only when `NODE_ENV` ≠ `production`.**
> They are excluded from the router at startup in production — any request to `/v1/dev/*` returns `404 not_found`.
> Production and frontend integration code must not depend on them.

Enabled in: `development`, `test`

### POST /v1/dev/reset

Clears all in-memory collections to empty.

```
200 { ok: true, data: { reset: true } }
```

### POST /v1/dev/seed

Resets all collections, then inserts a deterministic demo graph:

| Collection  | Count | Notable IDs |
|-------------|-------|-------------|
| projects    | 2     | `demo-proj-1`, `demo-proj-2` |
| workspaces  | 2     | `demo-ws-1` (proj-1), `demo-ws-2` (proj-2) |
| chat-windows | 3    | `demo-cw-1` (openai/gpt-4o), `demo-cw-2` (anthropic/claude-3-5-sonnet), `demo-cw-3` (perplexity/sonar) |
| messages    | 4     | user + assistant in cw-1, user in cw-2 and cw-3 |

Returns the full state snapshot after seeding.

```
200 { ok: true, data: { seeded: true; state: AppState } }
```

All IDs and `createdAt` values are fixed — calling seed multiple times produces identical state.

---

## Error codes

| code               | HTTP | meaning                                      |
|--------------------|------|----------------------------------------------|
| `not_found`        | 404  | Route or foreign-key entity missing          |
| `method_not_allowed` | 405 | Method not registered for this path         |
| `validation_error` | 400  | Missing or invalid request field             |
| `invalid_json`     | 400  | Request body is not valid JSON               |
| `internal_error`   | 500  | Unhandled exception                          |

---

## Env vars

| Name           | Default       | Notes                                  |
|----------------|---------------|----------------------------------------|
| `API_PORT`     | `4000`        | 1–65535                                |
| `NODE_ENV`     | `development` | `development` \| `production` \| `test` |
| `API_VERSION`  | `0.1.0`       | Reported by `/health`                  |
| `CORS_ORIGIN`  | `*`           | Set to `http://localhost:3000` in dev  |
