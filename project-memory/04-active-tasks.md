# 04 — Active Tasks

Not a sprint board. Just concrete next actions. Update when you finish or add one.

## Backend

- [x] Finish param router (`:id`), land on a feature branch (`feat/api-project-detail`).
- [x] `GET /v1/projects/:id` — 404 via `HttpError` → `fail('not_found', …)` envelope.
- [x] Tests for param router + detail endpoint (4 new, 10 total, all green).
- [x] Decide workspace storage shape; add `GET /v1/projects/:id/workspaces` (seeded readonly store on `feat/api-project-workspaces`).
- [ ] Sync origin `feat/api-foundation` (`de398ac`) into integration branch.
- [x] Push `feat/api-project-detail`.
- [ ] Open PR for `feat/api-project-detail` → `feat/integration-homepage-projects` (manual; no `gh` CLI).
- [ ] Open PR for `feat/web-project-detail-api` → `feat/integration-homepage-projects` (manual).
- [ ] Open PR for `feat/api-project-workspaces` → `feat/integration-homepage-projects` (manual).

## Frontend

- [x] Wire `/project/[id]` page to real `GET /v1/projects/:id` (mock fallback like homepage).
- [x] Source badge on project detail page, matching homepage pattern (shown on empty/error/invalid workspace states).
- [x] Error panel for detail 404 / network errors.
- [ ] Surface source badge when full workspace view is rendered (requires `headerRight` slot on `Workspace`).

## Shared / infra

- [ ] Pick DB (likely Postgres). Stub a persistence interface behind `services/`.
- [ ] Expand `.env.example` with real provider key hints + comments.
- [ ] CI: make typecheck/lint/test non-placeholder (remove `|| echo ...` fallbacks).

## Housekeeping

- [ ] Flesh out `apps/api/README.md` (currently 1 line).
- [ ] Flesh out `CONTRIBUTING.md` (currently 1 line).
- [ ] Document request/response envelope in `docs/technical/`.
