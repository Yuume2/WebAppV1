# @webapp/api

Minimal Node.js + TypeScript backend for AI Workspace V1.

## Purpose

Server-side API — auth, provider proxying, persistence. No framework yet; stdlib HTTP server as bootstrap. Framework choice deferred until features land.

## Structure

- `src/index.ts` — entry
- `src/config` — env + runtime config
- `src/routes` — HTTP route definitions
- `src/controllers` — request handlers
- `src/services` — domain logic
- `src/middleware` — request pipeline
- `src/lib` — utilities
- `src/types` — shared backend types

## Dev

```bash
pnpm --filter @webapp/api dev
```
