# Task runner — vision and current state

Operational doc for the AI task execution system on WebAppV1.

GitHub Issues + Project #1 are the **source of truth**. Notion mirrors tasks
read-only (see `docs/ops/notion-sync.md`); Notion will mirror questions
bidirectionally in Phase 3 (see `scripts/notion/questions-schema.md`). All AI
execution flows from GitHub.

The protocol Claude follows lives in
`project-memory/AI-ISSUE-EXECUTION-PROTOCOL.md`. This file is the human map
of where we're going.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ SOURCE OF TRUTH                                              │
│   GitHub Issues + Project #1                                 │
│   - tasks (issues), questions (issue comments + marker),     │
│   - statuses, labels, dependencies                           │
└─────────────────────────────────────────────────────────────┘
                ▲                       │
                │ write                 │ read
                │                       ▼
┌─────────────────────────────┐    ┌─────────────────────────┐
│ Claude (local, manual)      │    │ Notion                  │
│   protocole §AI-ISSUE       │◄───│ Tasks DB (read-only)    │
│   tools/task-*              │    │ Questions DB (Phase 3)  │
└─────────────────────────────┘    └─────────────────────────┘
                                            ▲
                                            │ n8n bridge
                                            │ (webappv1-question-to-whatsapp,
                                            │  webappv1-notion-answer-to-github)
                                            ▼
                                   ┌─────────────────────────┐
                                   │ WhatsApp (notif only)   │
                                   └─────────────────────────┘
```

## Phases

| Phase | Status | Goal |
|---|---|---|
| 0. Foundations (templates, scripts read-only) | **done** | Clean backlog, transparent priorisation |
| 1. Backlog precision (task-meta, scoring, AC strict) | **done in code** (backfill pending Yume's OK) | Each issue self-sufficient for AI exec |
| 2. Single-task runner with guard | **scaffolded** | Claude exec one safe task end-to-end on demand |
| 3. Human checkpoint via Notion + WhatsApp notif | **scaffolded** (no secrets wired) | Mobile Q/A loop |
| 4. Multi-task semi-autonomous loop | not started | Run nocturne fermant 3-5 issues |

We do **not** skip phases. Phase N must be stable before Phase N+1.

## Read-only tooling

| Command | Role |
|---|---|
| `pnpm task:next` | Top AI-ready issue (autonomous + safe + unassigned), sorted by priority |
| `pnpm task:score` | Score every open issue, explain `+/-` per signal |
| `pnpm task:score --autonomous` | Same, restricted to AUTONOMOUS class |
| `pnpm task:score --top 5 --json` | Machine-readable top N |
| `pnpm task:deps` | Build dependency graph, show ready/blocked/cycles |
| `pnpm task:deps --all` | Same + list issues with no declared deps |
| `pnpm task:stale` | Open issues with no update for >= 14 days |
| `pnpm task:meta` | Parse a task-meta block from stdin or `--file` |
| `pnpm task:guard` | Inspect current diff against denylist (no commit prevention here, just a check) |
| `pnpm task:run -- --plan-only` | Pick top candidate, print plan, exit (no side effect) |
| `pnpm task:test` | All tooling unit tests (60 today) |

## Mutating tools (require explicit flags)

| Command | Default | Explicit form |
|---|---|---|
| `pnpm task:meta:backfill` | DRY-RUN | `pnpm task:meta:backfill -- --yes --confirm "I MEAN IT"` |
| `pnpm task:questions ask --issue N --question "..."` | posts a comment | add `--dry-run` to preview |
| `pnpm task:questions resolve --qid q-... --issue N` | posts a comment | add `--dry-run` to preview |
| `pnpm task:run -- --exec` | switches branch, sets In Progress | refuses if dirty / unsafe / score ≤ 0 |

**No script auto-merges. No script pushes. No script runs in a loop.**

## Scoring formula

Implemented in `tools/task-score.mjs` and a simplified copy in
`tools/task-runner.mjs` for picking. Tunable.

```
Base priority      P0=+100  P1=+60  P2=+30  P3=+10
Autonomy bonus     ai:autonomous +30   risk:safe +30
Hard penalties     ai:human-checkpoint -200
                   risk:review-required -150
                   risk:destructive    -1000
Freshness          AC verified <= 7d:  +20
                   AC verified > 30d:  -40
                   no acLastVerifiedAt: -40
                   last activity > 30d: -20
Quality signals    has Test plan section: +15
                   has Context section:   +10
                   suspectedFiles set:    +10
                   expectedValidationCommand set: +10
Effort             complexity S: +20   M: +10   XL: -10
Availability       already assigned: -50
```

Negative score = the runner refuses to exec the task.

## task-meta v1 — issue body metadata

Embedded in each issue body as an HTML comment so it's invisible in rendered
Markdown but parseable by tooling.

```
<!-- task-meta v1
estimatedComplexity: M
suspectedFiles:
  - apps/api/src/routes/messages.ts
  - apps/web/src/features/chat/index.tsx
expectedValidationCommand: pnpm --filter @webapp/api test
acLastVerifiedAt: 2026-05-05T12:00:00Z
acLastVerifiedCommit: a2e4744
dependsOn:
  - 12
  - 34
blockingCriteria:
  - Human decision required for billing flow
-->
```

Round-trip is tested: parse → render → parse equals identity. See
`tools/task-meta.test.mjs`.

## Dependency convention

Both forms accepted by `task-deps.mjs` and the runner:

**Plain line in body:**
```
Depends on: #12, #34
```

**Inside task-meta block:**
```
dependsOn:
  - 12
  - 34
```

`task-deps.mjs` parses both, dedupes, detects cycles, reports ready vs blocked.

## Question/Answer protocol

A question is a GitHub issue comment whose body starts with:

```
<!-- claude-question v1
qid: q-<issue>-<seq>
taskIssue: <issue>
blockLevel: hard|soft|nice
status: pending
defaultIfNoAnswer: skip|continue|<choice>
defaultDelayHours: 24
createdAt: <ISO>
-->
```

The body below the marker contains the question, options, and recommendation.

An answer is a comment starting with:

```
<!-- claude-answer qid: q-<issue>-<seq> -->

<answer text>
```

Both can be posted by `pnpm task:questions ask|resolve`, or by the n8n bridge
mirroring Notion (Phase 3).

## Safety rules

**Claude may act alone on** — `risk:safe` + `ai:autonomous`, no destructive
paths, AC verifiable from code, score > 0, deps closed, guard clean.

**Claude must stop and ask** when any of these is true. Most are enforced by
`tools/task-guard.mjs`:

- Diff touches `apps/api/src/db/migrations/**`, `apps/api/src/db/schema*`
- Diff touches `apps/api/src/lib/{api-key-cipher,sentry,sessions}*`
- Diff touches `.github/workflows/**`
- Diff touches `docker-compose.yml`, `Dockerfile*`
- Diff touches `.env*` files
- Diff touches `pnpm-lock.yaml` / `package-lock.json` / `yarn.lock`
- Diff in `package.json` modifies `dependencies` / `devDependencies` / `peerDependencies`
- Diff > 500 lines OR > 25 files OR > 5 renames
- Issue body contains `stripe` / `billing` / `production database` / `prod-data` / `drop table` / `delete from` / `rm -rf`
- Branch protection on `main` is missing (currently the case — see `CLAUDE_NEEDS.md`)

These rules are encoded in `tools/task-guard.mjs::RULES`. Add or tighten there
with a corresponding test in `tools/task-guard.test.mjs`.

## Manual workflow Phase 2 (today)

This is what happens when **you** run a task. Claude does not loop yet.

```
1. pnpm task:next                      # see top candidate
2. pnpm task:run -- --plan-only         # confirm scoring + safety
3. (optional) pnpm task:run -- --exec   # switches branch, sets In Progress
4. Read AI-ISSUE-EXECUTION-PROTOCOL.md §6+ and execute (locally or via Claude)
5. Before each commit: pnpm task:guard --staged
6. Open PR with "Closes #N"
7. pnpm project:status:review N
8. STOP. Yume merges.
```

## Phase 3 prep — what's already in place

- `scripts/notion/questions-schema.md` — schema for Notion DB Questions.
- `scripts/notion/sync-questions.mjs` — bridge (env-driven, no secrets baked).
- `scripts/notion/.env.questions.example` — local template.
- `scripts/n8n/webappv1-question-to-whatsapp.json` — importable workflow.
- `scripts/n8n/webappv1-notion-answer-to-github.json` — importable workflow.
- `scripts/n8n/README.md` — setup checklist.
- `docs/ops/whatsapp-notif.md` — provider choice + setup checklist.

Nothing here is deployed. To activate Phase 3:
1. Create the Notion Questions DB per the schema.
2. Add `NOTION_QUESTIONS_DATABASE_ID` to repo secrets.
3. Import the n8n workflows, map credentials, test with a fixture.
4. Activate.

## What we are NOT doing yet

- No autonomous loop runner (deferred to Phase 4)
- No GitHub Action launching Claude
- No cron schedule (the task-runner workflow is `workflow_dispatch` only)
- No Notion bidirectional write on tasks (always read-only on the Tasks DB)
- No auto-merge — Yume merges
- No bulk migration of issues without `--yes --confirm "I MEAN IT"`
- No commit by default — every mutating script is dry-run unless explicitly told
- No branch protection change without Yume

## Open decisions

Tracked in `CLAUDE_NEEDS.md` at the repo root.
