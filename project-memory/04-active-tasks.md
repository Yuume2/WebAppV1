# 04 — Active Tasks

Not a sprint board. Concrete next actions.

## Done

- [x] Param router `:id` + `HttpError`.
- [x] `GET /v1/projects/:id`.
- [x] `GET /v1/projects/:id/workspaces`.
- [x] `GET /v1/workspaces/:id/windows`.
- [x] `GET /v1/windows/:id/messages`.
- [x] `Message` + `MessageRole` added to `@webapp/types`.
- [x] Frontend clients: `lib/api/{projects,workspaces,windows,messages}`.
- [x] `/project/[id]` wired end-to-end: project, workspaces, windows, messages — all with mock fallback.
- [x] All 6 feature branches integrated into `feat/integration-homepage-projects`. Tests 19/19, typecheck green, web build green.

## Remaining before PR `feat/integration-homepage-projects` → `main`

- [ ] Open PR manually on GitHub (no `gh` CLI).
- [ ] (Optional, cosmetic) add `headerRight` slot to `Workspace` and surface windows/messages source badges inside the rendered workspace view.

## After PR merges (V1 "ready to show" polish)

- [ ] Flesh out `apps/api/README.md`.
- [ ] Flesh out `CONTRIBUTING.md`.
- [ ] Remove `|| echo …` fallbacks in CI scripts; make typecheck/lint/test real gates.

## Bigger next-bloc decisions (outside V1 read path)

- [ ] Decide V1 track with Yume (Track A integration vs Track B `feat/api-foundation`). Blocks any write/auth/provider work.
- [ ] Write path: POST message, create window, create workspace — requires persistence story.
- [ ] DB pick (likely Postgres) + persistence interface behind `services/`.
- [ ] Real provider adapters (OpenAI/Anthropic/Perplexity).
- [ ] Auth (session cookie or token).
- [ ] `.env.example` with real provider key hints.
