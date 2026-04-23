# ADR 0003 — PostHog: prepared, integration deferred

- **Status:** Accepted — prepared only, no runtime integration in this PR
- **Date:** 2026-04-23
- **Deciders:** X (tech lead)

## Context

PostHog would give us product analytics (funnels, retention) and feature flags.
Both are real needs — but only once we have real users producing real sessions.
Today the web app is pre-MVP: no signup flow exposed, no users outside the team,
and the product surface (workspaces, chat windows, provider connections) is still
moving week to week. Instrumenting moving code produces events whose schema has
to be thrown away and re-coded.

## Decision

Prepare, do not integrate.

- Reserve env vars in `.env.example`: `NEXT_PUBLIC_POSTHOG_KEY`,
  `NEXT_PUBLIC_POSTHOG_HOST` (default to `https://eu.i.posthog.com` for GDPR).
- Document the event naming convention in
  `docs/technical/tooling-roadmap.md` so the first instrumentation PR is mechanical.
- No PostHog SDK in `apps/web/package.json`, no provider wrapper, no events.

## Trigger to lift the deferral

When **two** of the following are true, open the wave-3 PR:

1. Signup + login are reachable to non-team users.
2. The chat-window + message flow has not been reshaped for two consecutive weeks.
3. A product question requires a funnel we cannot answer from the DB alone.

## Consequences

- Zero runtime cost, zero client bundle impact today.
- Convention is set now, so the first instrumentation PR does not bikeshed names.

## Rejected alternatives

- **Instrument now with placeholder events** — guarantees a schema rewrite.
- **Google Analytics / Plausible** — insufficient for product funnels, no feature
  flags, and we don't need marketing-site analytics.
