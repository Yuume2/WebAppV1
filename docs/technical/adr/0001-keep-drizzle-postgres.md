# ADR 0001 — Keep Drizzle + Postgres, do not migrate to Supabase

- **Status:** Accepted
- **Date:** 2026-04-23
- **Deciders:** X (tech lead)

## Context

`apps/api` uses Drizzle ORM against a local Postgres 16 (via `docker-compose.yml`).
Three migrations are already applied (`0000..0002`), including `message_provider_metadata`.
Auth is custom: `src/db/sessions.repo.ts`, `src/db/users.repo.ts`, `src/lib/session-token.ts`,
`src/lib/cookie.ts`, `src/lib/resolve-user.ts`. Provider API keys are encrypted at rest
with AES-256-GCM (`src/lib/api-key-cipher.ts`, `PROVIDER_ENCRYPTION_KEY`).

The team discussed adopting Supabase. Supabase brings three things: hosted Postgres,
Supabase Auth (GoTrue), and Row Level Security primitives.

## Decision

We keep Drizzle + self-hosted Postgres + the current home-rolled cookie-session auth.
We do **not** migrate to Supabase Auth. We do **not** rewrite repositories against
the Supabase client.

## Consequences

- Zero churn on a working auth flow, working encryption flow, and a test suite that
  already exercises the real HTTP surface.
- We keep full control over the schema and migrations via `drizzle-kit`.
- Hosting Postgres on Supabase (as a plain managed Postgres provider, via
  `DATABASE_URL`) remains an option — re-evaluated at deployment time. Tracked in
  `docs/technical/tooling-roadmap.md` wave 4.

## Rejected alternatives

- **Supabase Auth** — would require rewriting sessions/users/resolve-user, all auth
  tests, and the provider-connection flow. No product value at this stage.
- **Prisma** — no incident with Drizzle; migration cost is gratuitous.
