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
