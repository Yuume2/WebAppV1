# Architecture overview

## High-level

```
[ Browser ]
    │
    ▼
[ apps/web  (Next.js App Router) ]
    │  (HTTP/JSON)
    ▼
[ apps/api  (Node.js) ]
    │
    ├──► OpenAI API
    ├──► Anthropic API
    ├──► Perplexity API
    └──► Database (TBD)
```

## Responsibilities

- `apps/web` — UI, routing, client-side state, rendering chat windows
- `apps/api` — auth, encrypted storage of user API keys, provider proxying, conversation persistence
- `packages/types` — shared contracts between web and api
- `packages/config` — shared constants / env schema
- `packages/ui` — shared React primitives

## Key decisions

- **Separate `web` and `api`** — keeps provider keys server-side only; web never touches user secrets directly.
- **Provider-agnostic abstraction** — a `Provider` interface in `packages/types` so new LLM vendors plug in without UI changes.
- **Deferred choices** — DB, auth library, HTTP framework picked when first feature requires them. Foundation stays framework-light.
