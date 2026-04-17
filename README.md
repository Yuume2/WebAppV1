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

## Structure

See `docs/technical/monorepo-structure.md`.
