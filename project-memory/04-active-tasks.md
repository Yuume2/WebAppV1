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
