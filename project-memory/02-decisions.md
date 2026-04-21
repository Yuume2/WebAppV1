# 02 — Decisions

Format: `YYYY-MM-DD — topic — decision — reason`.

## Record

- 2026-04-18 — Monorepo — pnpm workspaces + Turborepo — fast cache, easy cross-package links.
- 2026-04-18 — Split web/api — two separate apps — keeps user API keys server-side, cleaner boundaries.
- 2026-04-18 — No HTTP framework in api — custom Router over `node:http` — defer framework lock-in; swap when auth/streaming needs force it.
- 2026-04-18 — Response envelope — `ApiResponse<T> = {ok:true,data} | {ok:false,error}` — consistent parsing, typed error path.
- 2026-04-18 — Shared types package — `@webapp/types` for domain + transport — one source of contracts web+api consume.
- 2026-04-18 — In-memory projects store — frozen seed array — foundation before DB pick; replace atomically later.
- 2026-04-18 — Frontend data boundary — `src/lib/data` (mock) + `src/lib/api` (real) — keep UI switchable while backend grows; badge shows which source is live.
- 2026-04-18 — Vitest for api tests — integration via `server-harness` — fast, no runtime deps.
- 2026-04-18 — Workspace selection via `?workspace=` query param — URL-driven, no client routing state.

## Open

- Database choice — none yet. Likely Postgres (owned keys, relational). Pick when persistence required.
- Auth library — none yet. Probably Lucia or Auth.js when first auth-required feature lands.
- Provider abstraction layer — `AIProvider` union exists in types; adapter interface TBD.
- Path parameters in Router — WIP local stash adds `:param` support (see `08-recent-changes.md`).

## How to add a decision

Append one line: date, topic, decision, reason. Keep it tight. If detail needed, link a file in `docs/technical/`.
