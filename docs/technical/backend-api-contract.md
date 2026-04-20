# Backend API contract

Base URL: `http://localhost:4000`

All responses follow `ApiResponse<T>` from `@webapp/types`:

```
{ ok: true,  data: T }
{ ok: false, error: { code: string; message: string; details?: unknown } }
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

## Naming canonical decision

**`chatWindowId`** is the canonical field name for referencing a `ChatWindow`.

- `Message.chatWindowId` — the parent window of a message
- `GET /v1/messages?chatWindowId=` — filter messages by window
- `POST /v1/messages` body → `chatWindowId`

Frontend must use `chatWindowId`. **Do not use `windowId`.**

---

## Endpoints

### GET /health · GET /v1/health

```
200 { ok: true, data: HealthStatus }
```

---

### GET /v1/projects

```
200 { ok: true, data: Project[] }
```

### GET /v1/projects/:id

```
200 { ok: true,  data: Project }
404 { ok: false, error: { code: 'not_found', message } }
```

### POST /v1/projects

**Body:** `{ name: string; description?: string }`

```
201 { ok: true,  data: Project }
400 { ok: false, error: { code: 'validation_error' | 'invalid_json', message } }
```

---

### GET /v1/workspaces/:id

```
200 { ok: true,  data: Workspace }
404 { ok: false, error: { code: 'not_found', message } }
```

### GET /v1/workspaces?projectId=

**Query:** `projectId` required

```
200 { ok: true,  data: Workspace[] }
400 { ok: false, error: { code: 'validation_error', message } }
```

### POST /v1/workspaces

**Body:** `{ projectId: string; name: string }`

```
201 { ok: true,  data: Workspace }
400 { ok: false, error: { code: 'validation_error' | 'invalid_json', message } }
404 { ok: false, error: { code: 'not_found', message } }   ← projectId missing
```

---

### GET /v1/chat-windows/:id

```
200 { ok: true,  data: ChatWindow }
404 { ok: false, error: { code: 'not_found', message } }
```

### GET /v1/chat-windows?workspaceId=

**Query:** `workspaceId` required

```
200 { ok: true,  data: ChatWindow[] }
400 { ok: false, error: { code: 'validation_error', message } }
```

### POST /v1/chat-windows

**Body:** `{ workspaceId: string; title: string; provider: AIProvider; model: string }`

`provider` must be one of: `openai` | `anthropic` | `perplexity`

```
201 { ok: true,  data: ChatWindow }
400 { ok: false, error: { code: 'validation_error' | 'invalid_json', message } }
404 { ok: false, error: { code: 'not_found', message } }   ← workspaceId missing
```

Side effect: created window's `id` is appended to `workspace.windowIds`.

---

### GET /v1/messages/:id

```
200 { ok: true,  data: Message }
404 { ok: false, error: { code: 'not_found', message } }
```

### GET /v1/messages?chatWindowId=

**Query:** `chatWindowId` required

```
200 { ok: true,  data: Message[] }
400 { ok: false, error: { code: 'validation_error', message } }
```

### POST /v1/messages

**Body:** `{ chatWindowId: string; role: MessageRole; content: string }`

`role` must be one of: `user` | `assistant` | `system`

```
201 { ok: true,  data: Message }
400 { ok: false, error: { code: 'validation_error' | 'invalid_json', message } }
404 { ok: false, error: { code: 'not_found', message } }   ← chatWindowId missing
```

---

### GET /v1/state

Full snapshot of all in-memory collections.

```
200 { ok: true, data: { projects: Project[]; workspaces: Workspace[]; chatWindows: ChatWindow[]; messages: Message[] } }
```

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
