# ADR 0005 — Track A + Track B merged into `main`

- **Status:** Accepted
- **Date:** 2026-04-23
- **Deciders:** X (tech lead)

## Context

Two integration streams ran in parallel on `WebAppV1`:

- **Track A** — frontend-first, read-only: `projects → workspaces → chat-windows → messages` consumed from the API as an in-memory store (frozen seed arrays). Tests exercised the HTTP surface end-to-end without a database.
- **Track B** — backend-first, write-path: Drizzle + Postgres 16, custom cookie-session auth, provider-connections with AES-256-GCM encrypted API keys, Sentry, drizzle migrations `0000..0002` (including `message_provider_metadata`).

Track A was merged first (fast-forward of the read-path integration branch; tests 19/19 green). Track B landed via **PR #6** (`f46f599`) on top of the Track A surface.

Result on `main`: the HTTP surface is one unified contract. Routes decide at request time whether to hit Postgres (when `DATABASE_URL` is set) or the in-memory fallback (when it isn't).

## Decision

1. **`main` is the single source of truth.** Track A and Track B are retired as concepts; `origin/feat/api-foundation` is kept as an archival reference only (superseded by PR #6).
2. **DB-gated routing with in-memory fallback stays** until the fallback is explicitly removed in a later ADR. The contract:
   - `DATABASE_URL` **set** + `PROVIDER_ENCRYPTION_KEY` **set** → DB-backed controllers for auth, provider-connections, chat-windows, messages, projects, workspaces.
   - `DATABASE_URL` **unset** → legacy in-memory controllers for reads (`projects`, `workspaces`, `chat-windows`, `messages` as frozen seed data). Auth, write-path, and provider-connections return disabled/404 as appropriate.
   - The API logs which mode is active at boot.
3. **`@webapp/types` is the shared contract.** Both modes return the same `ApiResponse<T>` envelope and the same domain types — the fallback exists to keep the frontend demo-able without infra, not to diverge behaviour.

## Consequences

- Frontend dev can continue to run against a zero-infra API for UI-only work.
- Backend dev must keep the DB code path as the primary implementation; fallbacks are not load-bearing for product features (no auth, no write path, no provider calls in-memory).
- Two controller implementations exist per resource (`*.controller.ts` in-memory vs `*-db.controller.ts`). This duplication is acknowledged as tech debt and tracked by issue #35 (`refactor(api): collapse in-memory + db controller duplication`).
- New features land on the DB path first; the in-memory path is a best-effort compatibility shim.

## Fallback removal criteria (for the future ADR)

The in-memory fallback is removed when all of the following hold:

- Local dev uses `docker compose up -d postgres` without friction (already true as of issue #24).
- CI exercises DB-backed tests against an ephemeral Postgres (tracked by issue #32).
- No frontend path relies on the fallback for a demo-critical surface.

Removal is explicitly **out of scope** of this ADR.

## Rejected alternatives

- **Revert Track B and stay read-only** — would discard working auth, encryption, and persistence. No product value.
- **Remove the in-memory fallback immediately** — would force every contributor to run Postgres for any API work, including UI-only iterations. Premature for the current phase.
- **Two separate API binaries (one per track)** — doubles the deployment surface and diverges the envelope contract. Rejected.

## References

- PR #6 — Track B merge (`f46f599`).
- `project-memory/03-current-state.md` — current `main` snapshot.
- `project-memory/08-recent-changes.md` — merge history for `dbd40ef`, `87beb1c`, `c8e3c26`, `f46f599`.
- ADR 0001 — keep Drizzle + Postgres.
