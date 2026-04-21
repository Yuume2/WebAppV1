# 08 — Recent Changes

Newest first. One line per commit. Update at end of a session or via `tools/update-memory.sh`.

## 2026-04-21

- Memory system scaffolding added: `CLAUDE.md`, `project-memory/`, `tools/update-memory.sh`.
- Local WIP stashed: dynamic path params in api `Router` + `RequestContext.params` (`apps/api/src/lib/{http,router}.ts`). Not committed.

## 2026-04-18

- 497f0db feat(web): wire homepage project list to real GET /v1/projects
- aaf644f merge: bring feat/api-foundation into integration branch
- 67bda4e feat(api): readonly /v1/projects and vitest coverage for the foundation
- 4a10482 feat(api): route-controller-service foundation with shared response envelope
- 4b4c9ea feat(web): real local window creation with presets and rename
- 05ba6a6 feat(web): independent local chat sessions per window
- 5073896 feat(web): per-project workspace selection via ?workspace= param
- 478080f feat(web): workspace sidebar with shared window manager
- e27eb40 feat(web): frontend data boundary with mock-backed read API
- 9ff07c2 feat(web): workspace state hook, toolbar, focus and empty states
- 9005b08 feat(web): add frontend foundation and workspace UI skeleton
- 6404cd6 chore(root): stabilize monorepo for team workflow
- 2fc3938 chore: initialize monorepo foundation

## How to refresh

Run from repo root:

```bash
bash tools/update-memory.sh
```

Script appends the last N commits to this file under a new dated heading, and regenerates `project-memory/auto/tree.md`.

## 2026-04-21 (auto)

- 497f0db feat(web): wire homepage project list to real GET /v1/projects
- aaf644f merge: bring feat/api-foundation into integration branch
- 67bda4e feat(api): readonly /v1/projects and vitest coverage for the foundation
- 4a10482 feat(api): route-controller-service foundation with shared response envelope
- 4b4c9ea feat(web): real local window creation with presets and rename
- 05ba6a6 feat(web): independent local chat sessions per window
- 5073896 feat(web): per-project workspace selection via ?workspace= param
- 478080f feat(web): workspace sidebar with shared window manager
- e27eb40 feat(web): frontend data boundary with mock-backed read API
- 9ff07c2 feat(web): workspace state hook, toolbar, focus and empty states
