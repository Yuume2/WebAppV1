# 08 — Recent Changes

Newest first. One line per commit. Update at end of a session or via `tools/update-memory.sh`.

## 2026-04-24

- 9b45cf3 chore(types): add write-path DTOs for auth and provider-connections (#58).
- e49048d chore(tooling): project status automation — CLI + `pnpm project:status:*` (#56).
- 6fb6698 feat(providers): harden POST message loop — 412 no-provider, 30s timeout, `provider_error` code (#55).
- 3a04ee7 chore(env): commit `.env.example` for api and web (#54).
- 29f78aa feat(api): register `/v1/health` alias (#53).
- 0adce92 chore(infra): docker-compose postgres + local bootstrap docs (#51).
- 364f390 chore(db): document drizzle workflow (#50).
- 220dc68 chore(ci): issue + PR templates matching label taxonomy (#49).
- 397a83d chore(tooling): backlog automation + AI issue execution protocol.
- 82b6904 chore(ops): free GitHub → Notion Tasks sync (Actions + Notion API) (#48).

## 2026-04-23

- f46f599 merge: PR #6 — integrate messages provider metadata branch into main. **Track B merged.** Main now has DB-gated routes, auth, provider-connections (AES-GCM encrypted), Sentry, drizzle migrations.
- c8e3c26 feat(api): integrate messages provider metadata branch into main.
- 87beb1c feat(api): sentry init — minimal error capture (#4).
- dbd40ef chore(tooling): ADRs, roadmap, env placeholders, e2e scaffold (#3).

## 2026-04-22 (session pm)

- 5708b9a merge(integration): feat/api-window-messages into the Track A integration branch (no conflict).
- 97418e0 merge(integration): feat/api-workspace-windows into the Track A integration branch (no conflict).
- f1903e7 feat(api): add `GET /v1/windows/:id/messages` + seed store + `Message`/`MessageRole` types + frontend `lib/api/messages.ts` + per-window parallel fetch in `/project/[id]` with mock fallback. 3 new API tests (19 total).
- 152b5a1 feat(web): wire workspace view to real `GET /v1/workspaces/:id/windows` with `lib/api/windows.ts` and mock fallback.
- 128ae4d feat(api): add `GET /v1/workspaces/:id/windows` + seeded store + `workspaceExists` helper + 3 new tests (16 total at that point).
- Integration branch now carries the full Track A read path end-to-end: projects → workspaces → windows → messages. Tests 19/19 green, typecheck green, web build green.

## 2026-04-22

- Fast-forward merged `feat/web-project-workspaces-api` (and transitively all 4 feat branches) into the Track A integration branch. Tests 13/13 green, web build green. Integration branch now carried the full Track A surface.
- **Discovered `origin/feat/api-foundation` is 53 commits ahead** of the integration branch with a parallel DB+auth+OpenAI V1. Not merged this session. Flagged as a track decision needed in `03-current-state.md`.
- 7824866 feat(web): wire `/project/[id]` workspaces to real `GET /v1/projects/:id/workspaces` (mock fallback, dual badges, workspaces error panel).

## 2026-04-21

- (pending commit on `feat/api-project-workspaces`) feat(api): add `GET /v1/projects/:id/workspaces` with seeded store aligned with web mocks + 3 tests (13 total green).
- (on `feat/web-project-detail-api`, pushed) feat(web): wire `/project/[id]` to real `GET /v1/projects/:id` with mock fallback, 404-aware error panel, source badge.
- (on `feat/api-project-detail`, pushed) feat(api): `GET /v1/projects/:id` + `HttpError` + param router wiring + 4 new tests.
- 26c9ad6 docs(memory): add Claude restart workflow note
- 7cb01aa chore(memory): correct WIP state — working tree, not stash
- c4ae1ac chore(memory): add project-memory system and refresh tooling

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

## 2026-04-22 (auto)

- 101c416 feat(api): add GET /v1/projects/:id/workspaces
- 910bc91 feat(web): wire project detail page to real GET /v1/projects/:id
- e711a44 chore(memory): reflect project detail endpoint and HttpError
- 550c744 feat(api): add GET /v1/projects/:id with param router and HttpError
- 26c9ad6 docs(memory): add Claude restart workflow note
- 7cb01aa chore(memory): correct WIP state — working tree, not stash
- c4ae1ac chore(memory): add project-memory system and refresh tooling
- 497f0db feat(web): wire homepage project list to real GET /v1/projects
- aaf644f merge: bring feat/api-foundation into integration branch
- 67bda4e feat(api): readonly /v1/projects and vitest coverage for the foundation
