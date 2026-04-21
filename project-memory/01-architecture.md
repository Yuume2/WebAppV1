# 01 — Architecture

## Layout

```
WebAppV1/
├── apps/
│   ├── web/        Next.js 15 App Router (@webapp/web)
│   └── api/        Node HTTP server, no framework (@webapp/api)
├── packages/
│   ├── types/      shared domain contracts (@webapp/types)
│   ├── config/     shared runtime config/env schema (@webapp/config)
│   └── ui/         shared React primitives (@webapp/ui)
├── docs/
│   ├── product/    vision.md, mvp.md
│   └── technical/  architecture.md, monorepo-structure.md
├── project-memory/ structured memory for Claude sessions
├── tools/          scripts (memory helpers, etc.)
├── .github/workflows/ci.yml
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.base.json
```

## Flow

```
Browser → apps/web (Next.js RSC + client)
         │ HTTP/JSON
         ▼
         apps/api (Node http.createServer + custom Router)
         │
         ├── services (in-memory store for now)
         ├── (future) DB
         └── (future) OpenAI / Anthropic / Perplexity
```

## Boundaries

- `apps/web` never touches provider keys. Keys live server-side only.
- Contracts (types) pass from `@webapp/types` → consumed by both apps.
- `apps/api` has zero UI deps. `apps/web` has zero node-http deps.
- Request lifecycle in api:
  `http.createServer` → `handleRequest` middleware → `Router.match` → controller → service → `ApiResponse<T>` → `writeJson`.

## Frontend boundaries

- `src/lib/api/*` = typed HTTP client for the real backend.
- `src/lib/data/*` = mock-backed data boundary used by workspace/chat routes.
- Homepage uses `src/lib/api/projects.ts` with mock fallback when `NEXT_PUBLIC_API_URL` is unset.
- Other routes (project detail, workspace, chat) still on `lib/data` mocks.

## Why no framework in api

Kept lightweight on purpose. Framework choice deferred until real need (auth, streaming). Custom `Router` with literal path matching lives in `apps/api/src/lib/router.ts`.
