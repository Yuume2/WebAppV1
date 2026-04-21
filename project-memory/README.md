# project-memory/

Structured memory for Claude sessions. Lives in Git. Versioned like code.

## Read order

1. `00-overview.md` — what + why
2. `03-current-state.md` — done / in-progress / blocked
3. Agent-specific entry:
   - `agent-entry-frontend.md`
   - `agent-entry-backend.md`
   - `agent-entry-fullstack.md`
4. Maps when you need detail: `01-architecture.md`, `05-api-map.md`, `06-frontend-map.md`, `07-backend-map.md`
5. History/context: `02-decisions.md`, `08-recent-changes.md`
6. Task queue: `04-active-tasks.md`

## Rules

- Repo = truth. If memory contradicts code, fix memory.
- Keep files short. Prune over rewrite.
- One change in reality → one update here in the same PR.
- No invented status. "I don't know" is a valid line.

## Auto-generated

- `auto/tree.md` — refreshed by `tools/update-memory.sh`. Do not edit by hand.

## Obsidian

Open the repo as a vault. Markdown + wiki-link friendly. Don't edit files only meant for Claude (agent-entry-*); fix the source, commit, Obsidian reflects it.
