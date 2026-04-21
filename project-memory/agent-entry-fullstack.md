# Agent entry — Fullstack

You're touching both `apps/web` and `apps/api`, probably via `@webapp/types`.

## Read first

1. `project-memory/00-overview.md`
2. `project-memory/01-architecture.md`
3. `project-memory/03-current-state.md`
4. `project-memory/05-api-map.md`
5. `project-memory/06-frontend-map.md`
6. `project-memory/07-backend-map.md`

## Workflow for adding a feature end-to-end

1. **Type first.** Add/extend shape in `packages/types/src/index.ts`. Rebuild types.
2. **Backend.** Controller → service → register route → vitest. Keep envelope.
3. **Frontend client.** Add `apps/web/src/lib/api/<resource>.ts` using `apiFetch`.
4. **Frontend UI.** Consume the client in a page/feature. Mock fallback if appropriate.
5. **Memory.** Update `03-current-state.md`, `05-api-map.md`, `06-frontend-map.md`, `08-recent-changes.md`.

## Golden rules

- Single source for domain shapes: `@webapp/types`.
- `apps/web` never imports from `apps/api` and vice versa. Shared code lives in `packages/*`.
- Keep the `ApiResponse<T>` envelope. Both sides parse it the same way.
- Pattern for env-gated real-API use on web: mirror the homepage (`apps/web/src/app/page.tsx` + `lib/api/projects.ts`).
- No DB / auth / provider code added without a line in `02-decisions.md`.

## Avoid

- Cross-app refactors without typecheck at the root (`pnpm typecheck`).
- Breaking shared types without running all consumers.
- Half-shipping a feature: types without backend, backend without UI, etc. If you must split, note it in `04-active-tasks.md`.

## Dev

```bash
pnpm install
pnpm dev            # all apps at once via turbo
pnpm typecheck
pnpm test
```

## When you finish

Update `03`, `05`, `06`, `07`, `08`. Don't forget `02-decisions.md` if you made a structural choice.
