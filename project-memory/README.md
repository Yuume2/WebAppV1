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

## Comment relancer une session Claude sur ce projet

1. Ouvrir Claude à la racine du repo (`/Users/yume/Desktop/WebAppV1`).
2. Lire d'abord : `CLAUDE.md`, puis `project-memory/00-overview.md` et `project-memory/03-current-state.md`.
3. Choisir un agent entry selon la tâche :
   - Frontend → `agent-entry-frontend.md` + `06-frontend-map.md`
   - Backend → `agent-entry-backend.md` + `05-api-map.md` + `07-backend-map.md`
   - Fullstack → `agent-entry-fullstack.md`
4. Ne pas scanner tout le repo. Utiliser `Grep`/`Glob` ciblés et les fichiers `project-memory/` comme résumé.
5. Après un changement important, mettre à jour dans la même PR :
   - `03-current-state.md` (done / in-progress / blocked)
   - `04-active-tasks.md` (tâches qui bougent)
   - `08-recent-changes.md` (une ligne par commit ou via `tools/update-memory.sh`)
   - la map impactée (`05-api-map.md`, `06-frontend-map.md`, `07-backend-map.md`) si l'API/UI a changé.

## Auto-generated

- `auto/tree.md` — refreshed by `tools/update-memory.sh`. Do not edit by hand.

## Obsidian

Open the repo as a vault. Markdown + wiki-link friendly. Don't edit files only meant for Claude (agent-entry-*); fix the source, commit, Obsidian reflects it.
