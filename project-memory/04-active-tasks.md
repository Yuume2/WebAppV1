# 04 — Active Tasks

Not a sprint board. Just concrete next actions. Update when you finish or add one.

## Backend

- [ ] Finish param router (`:id`), unstash and land on a feature branch.
- [ ] `GET /v1/projects/:id` — 404 via `ApiError` envelope on unknown id.
- [ ] Tests for param router + detail endpoint.
- [ ] Decide workspace storage shape; add `GET /v1/projects/:id/workspaces`.
- [ ] Sync origin `feat/api-foundation` (`de398ac`) into integration branch.

## Frontend

- [ ] Wire `/project/[id]` page to real `GET /v1/projects/:id` (mock fallback like homepage).
- [ ] Source badge on project detail page, matching homepage pattern.
- [ ] Error panel for detail 404 / network errors.

## Shared / infra

- [ ] Pick DB (likely Postgres). Stub a persistence interface behind `services/`.
- [ ] Expand `.env.example` with real provider key hints + comments.
- [ ] CI: make typecheck/lint/test non-placeholder (remove `|| echo ...` fallbacks).

## Housekeeping

- [ ] Flesh out `apps/api/README.md` (currently 1 line).
- [ ] Flesh out `CONTRIBUTING.md` (currently 1 line).
- [ ] Document request/response envelope in `docs/technical/`.
