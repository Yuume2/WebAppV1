# @webapp/web

Next.js 15 (App Router) frontend for AI Workspace V1.

## Purpose

User-facing interface — projects, workspace canvas, multi-window AI chat.

## Structure

- `src/app` — App Router routes, layouts, pages
- `src/components` — reusable presentational components
- `src/features` — feature modules (workspace, chat, providers…)
- `src/lib` — framework-agnostic utilities
- `src/hooks` — React hooks
- `src/styles` — global styles
- `src/types` — frontend-only TS types

## Dev

```bash
pnpm --filter @webapp/web dev
```

## Talking to the API

The homepage project list calls `GET /v1/projects` when `NEXT_PUBLIC_API_URL` is set:

```bash
# .env.local (apps/web)
NEXT_PUBLIC_API_URL=http://localhost:4000
```

Behavior:

- env set + backend up → real API, header badge reads `api`
- env set + backend down → visible error panel, badge reads `api error`
- env unset → local mock fixtures, badge reads `mock data`

The workspace/chat routes still run on the local mock-backed data layer — the backend does not serve those yet.
