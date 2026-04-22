# 04 — Active Tasks

Not a sprint board. Just concrete next actions. Update when you finish or add one.

## Backend

- [x] Finish param router (`:id`), land on a feature branch (`feat/api-project-detail`).
- [x] `GET /v1/projects/:id` — 404 via `HttpError` → `fail('not_found', …)` envelope.
- [x] Tests for param router + detail endpoint (4 new, 10 total, all green).
- [x] Decide workspace storage shape; add `GET /v1/projects/:id/workspaces` (seeded readonly store on `feat/api-project-workspaces`).
- [x] Fast-forward merge all 4 feature branches into `feat/integration-homepage-projects` (done 2026-04-22, tests + build green).
- [ ] **Decide V1 track with Yume** (Track A integration vs Track B `feat/api-foundation`). Blocks further coding.
- [ ] If Track A wins: open PR `feat/integration-homepage-projects` → `main` (manual, no `gh` CLI).
- [ ] If Track A wins: windows endpoint `GET /v1/workspaces/:id/windows` + frontend wiring.
- [ ] If Track B wins: audit `feat/api-foundation` locally, port docs, decide Track A commit fate.

## Frontend

- [x] Wire `/project/[id]` page to real `GET /v1/projects/:id` (mock fallback like homepage).
- [x] Source badge on project detail page, matching homepage pattern (shown on empty/error/invalid workspace states).
- [x] Error panel for detail 404 / network errors.
- [x] Wire `/project/[id]` workspaces to real `GET /v1/projects/:id/workspaces` (mock fallback + dedicated source badge).
- [ ] Surface source badge when full workspace view is rendered (requires `headerRight` slot on `Workspace`).
- [ ] Open PR for `feat/web-project-workspaces-api` → `feat/integration-homepage-projects` (manual).

## Shared / infra

- [ ] Pick DB (likely Postgres). Stub a persistence interface behind `services/`.
- [ ] Expand `.env.example` with real provider key hints + comments.
- [ ] CI: make typecheck/lint/test non-placeholder (remove `|| echo ...` fallbacks).

## Housekeeping

- [ ] Flesh out `apps/api/README.md` (currently 1 line).
- [ ] Flesh out `CONTRIBUTING.md` (currently 1 line).
- [ ] Document request/response envelope in `docs/technical/`.
