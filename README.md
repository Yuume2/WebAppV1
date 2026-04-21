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
pnpm dev
```

This starts both services in parallel via Turborepo:

| Service | URL |
|---------|-----|
| Web (Next.js) | http://localhost:3000 |
| API (Node.js) | http://localhost:4000 |

No `.env.local` is needed for local development — the web app points to `http://localhost:4000` by default.

**First run:** the API starts with two bare demo projects and no workspaces or messages.
Click the **Seed** button in the dev toolbar (top-right) to load a fully populated demo graph instantly.

## Structure

See `docs/technical/monorepo-structure.md`.
