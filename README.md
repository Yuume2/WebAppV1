# AI Workspace V1

Monorepo foundation for AI Workspace — users connect multiple AI providers (OpenAI, Anthropic, Perplexity) and manage multiple chat contexts inside projects.

## Stack

- pnpm workspaces + Turborepo
- TypeScript everywhere
- `apps/web` — Next.js (App Router)
- `apps/api` — Node.js backend
- `packages/ui`, `packages/config`, `packages/types` — shared code

## Getting started

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm dev
```

Both `.env.example` files are safe to commit and serve as the source of truth for every env var read by the apps. Running `pnpm dev` with only these placeholders works — the backend falls back to the in-memory store when `DATABASE_URL` is unset, and the frontend falls back to mock data when `NEXT_PUBLIC_API_URL` is unset.

For the full DB-backed path, see [apps/api/README.md](./apps/api/README.md#local-postgres-db-mode).

## Structure

See `docs/technical/monorepo-structure.md`.
