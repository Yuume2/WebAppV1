# Agent entry — Backend

You're working on `apps/api`. Node 20+, TS strict, `node:http` + custom router.

## Read first (in order)

1. `project-memory/00-overview.md`
2. `project-memory/03-current-state.md`
3. `project-memory/07-backend-map.md`
4. `project-memory/05-api-map.md`
5. `apps/api/README.md`

## Where things live

- Routes registry: `apps/api/src/routes/index.ts`
- Controllers: `apps/api/src/controllers/`
- Services: `apps/api/src/services/`
- Envelope + Router: `apps/api/src/lib/{http,router}.ts`
- Middleware: `apps/api/src/middleware/handle-request.ts`
- Env: `apps/api/src/config/env.ts`
- Tests: colocated `*.test.ts` + `src/test/server-harness.ts`

## Rules

- All responses go through `ok()` / `fail()` helpers. Never write raw JSON.
- Keep controllers thin: parse → call service → return envelope. No data work in controllers.
- Services own data. No res/req in services.
- No framework added without asking (Express/Fastify/Hono are off-limits unless decided).
- Keep router changes backwards-compatible; web consumes it.
- Add a vitest with `server-harness` for every new endpoint.
- Use `@webapp/types` for all domain types. Don't redefine shapes locally.

## Path params status

Current `Router` does literal paths only. A local WIP branch (stashed) adds `:param` support. Unstash with `git stash list` → `git stash pop` before starting detail/resource endpoints.

## Avoid

- Breaking the envelope shape (`ApiResponse<T>`). Web depends on it.
- Logging secrets. Use `logger` with structured fields.
- Sync I/O in controllers.
- Introducing a DB without a decision recorded in `02-decisions.md`.

## Dev

```bash
pnpm --filter @webapp/api dev
pnpm --filter @webapp/api test
pnpm --filter @webapp/api typecheck
```

## When you finish

- Update `project-memory/05-api-map.md` (new routes / signatures).
- Update `project-memory/07-backend-map.md` if structure changed.
- Update `project-memory/03-current-state.md`.
- Append to `project-memory/08-recent-changes.md`.
