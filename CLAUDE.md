# CLAUDE.md — WebAppV1

Entry point for Claude sessions. Read this first. Keep it short. Stay on-task.

## Project, one line

AI Workspace monorepo. Users connect their own AI provider keys (OpenAI, Anthropic, Perplexity) and organize multi-window chats inside projects.

## Source of truth

- **Git repo = truth.** Not chat history, not Obsidian, not prior session memory.
- `project-memory/` = structured memory in the repo. Lives in Git. Versioned.
- Obsidian = human reader view only.
- If memory contradicts code, trust code. Fix memory.

## What to read first (token-minimal path)

Order depends on task:

1. Always: `project-memory/00-overview.md` (~1min read)
2. Always: `project-memory/03-current-state.md`
3. Task-specific:
   - Frontend → `project-memory/agent-entry-frontend.md` + `06-frontend-map.md`
   - Backend  → `project-memory/agent-entry-backend.md`  + `05-api-map.md` + `07-backend-map.md`
   - Full → `project-memory/agent-entry-fullstack.md`
4. For big picture → `01-architecture.md`, `02-decisions.md`
5. For recent context → `08-recent-changes.md`

Skip the rest unless needed. Don't read the whole codebase.

## Rules

- Repo is truth. Update memory when reality changes.
- Don't invent state. If unsure, check code or say so.
- Don't add features, abstractions, or comments not requested.
- Don't write summaries in code files. Docstrings allowed when non-obvious.
- Never force-push, reset --hard, or rewrite shared history without explicit ask.
- Uncommitted work may exist. Check `git status` before destructive ops.
- Conventional commits: `feat(scope): …`, `fix(scope): …`, `chore(scope): …`.
- Branch pattern: `feat/<scope>-<slug>`. PRs target `main`.

## Token budget hygiene

- Prefer `project-memory/` summaries over re-reading source.
- Use `Grep` / `Glob` before `Read`. Avoid reading whole files.
- For code search across repo, delegate to Explore/chercheur agent.
- Update `08-recent-changes.md` at end of a working session, not mid-session.

## Stack reminders

- pnpm workspaces + Turborepo, TS strict.
- `apps/web` = Next.js 15 App Router.
- `apps/api` = Node.js HTTP (no framework), custom router.
- `packages/{types,config,ui}` = shared `@webapp/*`.
- Node >= 20, pnpm 9.15.0.

## Common commands

```bash
pnpm install
pnpm dev                             # all apps
pnpm --filter @webapp/web dev        # web only
pnpm --filter @webapp/api dev        # api only
pnpm typecheck
pnpm test
pnpm build
```

## Update the memory

When code changes break a file in `project-memory/`, fix that file in the same PR. That's the deal.
