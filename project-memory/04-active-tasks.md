# 04 — Active Tasks

**Authoritative source: [GitHub Project #1 — Yuume2/WebAppV1](https://github.com/users/Yuume2/projects/1).**

This file is intentionally short. Do not hand-maintain a task list here — the Project board is the truth, and tooling automates the lifecycle.

## Agent workflow

1. Pick the highest-priority Ready issue (`P0-now` first, no blockers, not already assigned).
2. Mark it In Progress: `node tools/issue-status.mjs <n> "In Progress"` (also exposed as `pnpm project:status:in-progress <n>`).
3. Branch: `feat/<scope>-<slug>-#<n>` (or `chore/…-#<n>` / `fix/…-#<n>`).
4. Implement + tests. AC vs code reality check before declaring done.
5. PR with `Closes #<n>`. Move to Review: `pnpm project:status:review <n>`.
6. Follow-ups → `project-memory/backlog/issues.delta.json`, then `pnpm issues:delta:dry-run` (auto-apply only when every follow-up is `risk:safe` + `ai:autonomous`).

Full protocol: `project-memory/AI-ISSUE-EXECUTION-PROTOCOL.md`. Command sheet: `project-memory/prompts/execute-issue.md`.

## Labels

- Role: `role:frontend`, `role:backend`, `role:coord`.
- Type: `type:feat`, `type:fix`, `type:chore`, `type:docs`, `type:refactor`, `type:test`.
- Priority: `P0-now`, `P1-week`, `P2-soon`, `P3-backlog`.
- Risk: `risk:safe`, `risk:review-required`.
- AI: `ai:autonomous`, `ai:human-checkpoint`.

Merge authority: the agent may auto-merge only when `risk:safe` AND `ai:autonomous` AND CI passes AND no secret / sensitive code is touched. Otherwise Review only.

## Backlog cheat-sheet

`project-memory/backlog/issues.json` holds the seed backlog. Deltas (new issues, updates) go through `tools/create-github-issues.mjs` with `pnpm issues:delta:{dry-run,apply}`.

## Tooling — pick / triage / runner

Read-only:
- `pnpm task:next` — top AI-ready issue: `ai:autonomous` + `risk:safe`, unassigned.
- `pnpm task:score [--top N|--autonomous|--json]` — explainable scoring for every open issue.
- `pnpm task:deps [--all|--json]` — dependency graph, ready vs blocked vs cycles.
- `pnpm task:stale` — open issues with no update for >= 14 days. Override with `STALE_DAYS=N`.
- `pnpm task:meta` — parse a `task-meta v1` block from stdin or `--file path`.
- `pnpm task:guard [--staged|--base ref]` — inspect diff against denylist.
- `pnpm task:run -- --plan-only` — print the runner plan, no side effect.

Mutating (require explicit flags):
- `pnpm task:meta:backfill -- --yes --confirm "I MEAN IT"` — backfill `acLastVerifiedAt`/`acLastVerifiedCommit` on every open issue. Default: dry-run.
- `pnpm task:questions ask --issue N --question "..." [--dry-run]` — post a `claude-question` comment on an issue.
- `pnpm task:run -- --exec` — sets the picked issue to In Progress and creates a working branch. **No commit, no push, no PR.**

Tests:
- `pnpm task:test` — full tooling suite (60 tests, all green).

## Issue templates

`.github/ISSUE_TEMPLATE/{frontend,backend,coord}.yml` enforce: Goal / Acceptance criteria / Out of scope / Test plan / Context / Priority / AI autonomy / Risk.

## AC body linter

`tools/apply-issue-delta.mjs` rejects deltas whose issue body is missing `## Goal`, `## Acceptance criteria`, or `## Out of scope`. Strict by default. Bypass: `LINT_AC=warn` (only for emergency use).

## task-meta v1

Issue bodies can carry a structured metadata block parsed by every tool:

```
<!-- task-meta v1
estimatedComplexity: M
suspectedFiles:
  - path/to/file.ts
expectedValidationCommand: pnpm test
acLastVerifiedAt: 2026-05-05T12:00:00Z
acLastVerifiedCommit: a2e4744
dependsOn:
  - 12
blockingCriteria:
  - human decision required
-->
```

See `docs/ops/task-runner.md` for the full operational doc.
