# 07 — Backend Map

App: `apps/api`. Node 20+, TS strict, plain `node:http`, no framework.

## Responsibilities

- Serve JSON endpoints for the web app.
- Own all sensitive state (future: user keys, DB).
- Enforce a uniform `ApiResponse<T>` envelope.

## Structure

```
apps/api/src
├── index.ts                 entrypoint, listen, shutdown
├── config/
│   └── env.ts               parses/validates env
├── lib/
│   ├── http.ts              types + ok/fail/writeJson/isHttpMethod
│   ├── logger.ts            structured logger
│   ├── request-id.ts        uuid per request
│   ├── router.ts            custom method+path matcher
│   └── server.ts            buildRouter + createApiServer
├── middleware/
│   ├── handle-request.ts    request pipeline
│   └── handle-request.test.ts
├── routes/
│   ├── index.ts             RouteDefinition[]
│   ├── health.test.ts
│   └── projects.test.ts
├── controllers/
│   ├── health.controller.ts
│   └── projects.controller.ts
├── services/
│   └── projects.service.ts  in-memory frozen seed
├── test/
│   └── server-harness.ts    boots http.Server for tests
└── types/                   (placeholder)
```

## Request flow

1. `createApiServer()` → `http.createServer(handler)`.
2. `handleRequest(router, req, res)` reads method+URL, creates `RequestContext`, calls `router.match`.
3. Controller runs, returns `ApiResponse<T>`.
4. `writeJson(res, 200, body, requestId)` sends it.
5. No handler → 405 `method_not_allowed` if path is registered for another method, else 404 `not_found`. Unknown HTTP method → 405 immediately. Thrown handler errors → 500 `internal_error`. All via `fail()` envelope.

## Sensitive zones

- `lib/router.ts` — path matching; change carefully. Local WIP adds `:param` support.
- `lib/http.ts` — envelope contract; do not break shape (web depends on it).
- `services/projects.service.ts` — in-memory store; will be swapped for DB. Keep interface narrow.
- `middleware/handle-request.ts` — global error path; any throw must become a proper `ApiResponse` + status.

## Tests

- Vitest, integration-style via `server-harness` spinning a real `http.Server` on ephemeral port.
- 6 tests pass as of 2026-04-18. Run: `pnpm --filter @webapp/api test`.

## Env

`API_PORT` (4000), `NODE_ENV` (`development|production|test`), `API_VERSION` (`0.1.0`).
