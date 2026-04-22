# Agent entry — Frontend

You're working on `apps/web`. Next.js 15 App Router, TS strict.

## Read first (in order)

1. `project-memory/00-overview.md`
2. `project-memory/03-current-state.md`
3. `project-memory/06-frontend-map.md`
4. `apps/web/README.md`

## Where things live

- Pages: `apps/web/src/app/**/page.tsx`
- Feature modules: `apps/web/src/features/<name>/`
- Shared primitives: `apps/web/src/components/`
- Real API client: `apps/web/src/lib/api/`
- Mock data boundary: `apps/web/src/lib/data/`
- Static mocks: `apps/web/src/lib/mocks/`
- Styles: `apps/web/src/styles/globals.css`

## Contracts

- Use types from `@webapp/types` for all API shapes.
- Envelope: `ApiResponse<T>` = `{ok,data}|{ok:false,error}`. Unwrap in `apiFetch`.

## Rules

- Don't fetch directly in pages if unnecessary; build a `lib/api/<resource>.ts` helper.
- Keep feature state inside the feature folder. No global store unless asked.
- Follow the homepage pattern when wiring a route to the real API: env-gated, mock fallback, visible source badge.
- Do not introduce Tailwind, shadcn, or heavy design systems without asking Yume.
- No Redux / Zustand / SWR / react-query yet — keep it local.
- Server components by default. `"use client"` only where needed.

## Avoid

- Breaking the `ApiResponse` envelope parsing.
- Touching `apps/api/*` from here. Cross-app changes need two-phase thinking.
- Moving types to web-only when they're shared with api — put them in `@webapp/types`.

## Dev

```bash
pnpm --filter @webapp/web dev
pnpm --filter @webapp/web typecheck
```

## When you finish

- Update `project-memory/06-frontend-map.md` if routes/features changed.
- Update `project-memory/03-current-state.md` done/in-progress.
- Append to `project-memory/08-recent-changes.md`.
