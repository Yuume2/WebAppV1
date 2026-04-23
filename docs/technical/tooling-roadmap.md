# Tooling roadmap

Status of the four external tools discussed (Supabase, PostHog, Sentry, Playwright)
and the order in which they land. Companion to ADRs 0001–0004.

## Principles

- One tool per wave. No simultaneous big integrations.
- Additive PRs only. No destructive migration of working subsystems.
- `apps/api/src/**`, `apps/web/src/**` and `packages/**` are not touched by
  tooling-foundation work (this PR) — they are touched only by the wave that
  owns the integration.

## Waves

### Wave 1 — Sentry (now)

Owner split:

- **L** — `apps/api`: `@sentry/node` init in `src/index.ts`, capture from the
  `internal_error` branch of `src/middleware/handle-request.ts`.
- **E** — `apps/web`: `@sentry/nextjs` via the official wizard.

DSNs from `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`. Empty ⇒ Sentry disabled.
Scope: unhandled errors only. Performance tracing, session replay, release
health, source-maps upload — **not** in wave 1.

Exit criteria: a deliberately-thrown error in api and in web appears in Sentry
under the correct project, with a request id on the api side.

### Wave 2 — Playwright real scenarios (when frontend has been stable 2 weeks)

Scaffold already exists in `apps/e2e/` (this PR). Wave 2 adds:

- Chromium browser install step in the `e2e-smoke` CI job.
- Three UI specs covering the golden path:
  - `auth.spec.ts` — signup, login, logout, `me`.
  - `provider-connect.spec.ts` — add OpenAI key, live connection test passes.
  - `chat-send.spec.ts` — create workspace → create chat window → send a
    message → assistant reply persists with provider metadata.
- Flip `continue-on-error` off once the three specs are green on `main` twice
  in a row.

### Wave 3 — PostHog real instrumentation (when product is live)

Triggered by ADR 0003 criteria. Scope of the first PR:

- `@posthog/node` in api (server-side events for auth, provider connections).
- `posthog-js` in web, initialized behind `NEXT_PUBLIC_POSTHOG_KEY`.
- First batch of events (see convention below).
- One feature flag, round-tripped through the UI to validate the wiring.

### Wave 4 — Supabase as managed Postgres (deployment-time decision only)

Evaluated **only** as a hosted Postgres provider via `DATABASE_URL`. Not as
Supabase Auth, not as a replacement for Drizzle, not for RLS. ADR 0001 stands.
Decision point: when the app moves off the local `docker-compose.yml` Postgres
toward a hosted environment.

---

## Instrumentation convention (applies to wave 1 and wave 3)

### Event names — `snake_case`, verb first

Good: `user_signed_up`, `provider_connection_created`, `message_sent`,
`workspace_opened`, `chat_window_created`.

Bad: `UserSignedUp`, `signup`, `new_message`, `click_button_42`.

### Event properties — `camelCase`

Good: `{ provider: 'openai', workspaceId: 'ws_…', chatWindowId: 'cw_…' }`.

Bad: `{ Provider: 'OpenAI', workspace_id: 'ws_…' }`.

### Hard rules

1. **No raw PII.** Never send email, display name, IP, or user agent as an
   event property. Send `userId` (the opaque server id) and nothing else that
   identifies a person.
2. **No provider API keys, ever.** Not as a property, not hashed, not
   truncated, not as a label. Presence/absence is expressed by a boolean like
   `hasOpenaiKey`.
3. **No message content.** Event properties for `message_sent` are metadata
   only: `provider`, `model`, `chatWindowId`, `tokenCount` (when available),
   `latencyMs`. Never `content`.
4. **Server emits server events; client emits client events.** A signup is a
   server event (api knows it happened). A "user clicked the composer" is a
   client event. Do not double-count.
5. **Error-track, don't event-track, errors.** Crashes go to Sentry. Only
   successful state transitions are PostHog events.

### Sampling

- Sentry errors: 100%.
- Sentry transactions (when later enabled): 10% in prod, 0% elsewhere.
- PostHog: 100% — no sampling until volume justifies it.
