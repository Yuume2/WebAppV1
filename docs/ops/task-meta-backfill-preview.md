# task-meta backfill — preview

Captured from a live `pnpm task:meta:backfill` (dry-run) at 2026-05-05.

## Summary

| Metric | Value |
|---|---|
| Open issues scanned | 10 |
| Already have a `task-meta v1` block | 0 |
| Would receive a backfill patch | 10 |
| Skipped (already meta) | 0 |
| Commit anchor proposed | `a2e4744` (current `main` HEAD) |
| `acLastVerifiedAt` proposed | `2026-05-05T09:48:55Z` |

## Conservative payload per issue

The backfill only writes the two fields that an automated tool can populate
honestly:

```yaml
acLastVerifiedAt: 2026-05-05T09:48:55Z
acLastVerifiedCommit: a2e4744
```

It deliberately does **not** populate:

- `estimatedComplexity` — a human must classify; placeholder would mislead the scorer.
- `suspectedFiles` — requires reading the AC and grepping the codebase per issue.
- `expectedValidationCommand` — depends on the AC's test plan.
- `dependsOn` — must be a deliberate human decision, never inferred.
- `blockingCriteria` — context-specific.

The script is idempotent: re-running on issues that already have a `task-meta`
block skips them unless `--force-overwrite` is passed.

## Issues that would be patched

| # | Title | Labels (priority + autonomy + risk) |
|---|---|---|
| 10 | [backend] feat(api/runtime): verify full backend flow with Supabase + OpenAI | P0-now, ai:autonomous, risk:review-required |
| 11 | [backend] setup api environment variables | P0-now, ai:autonomous, risk:review-required |
| 13 | [backend] feat(providers): provider-connections CRUD + metadata validation | P1-week, ai:autonomous, risk:review-required |
| 20 | [frontend] feat(web): rename + delete for projects/workspaces/chat-windows | P2-soon, ai:autonomous, risk:review-required |
| 26 | [backend] feat(providers): encrypt provider api keys at rest | P0-now, ai:human-checkpoint, risk:destructive |
| 29 | [backend] feat(auth): session middleware + GET /v1/me | P1-week, ai:human-checkpoint, risk:review-required |
| 35 | [backend] refactor(api): collapse in-memory + db controller duplication | P3-backlog, ai:autonomous, risk:review-required |
| 41 | [frontend] feat(web): Sentry browser SDK init | P2-soon, ai:autonomous, risk:safe |
| 42 | [frontend] test(web): Playwright golden-path e2e | P2-soon, ai:autonomous, risk:safe |
| 45 | [coord] chore(repo): seed GitHub labels from taxonomy | P1-week, ai:human-checkpoint, risk:safe |

Of these 10, only **#41** and **#42** pass the runner's autonomous filter
(`ai:autonomous` + `risk:safe`, no `risk:review-required` or
`ai:human-checkpoint`). All others remain visible in the score board with
their disqualifying labels surfaced.

## What's still missing per issue (after the backfill)

The backfill only stamps freshness. The richer signals — and the biggest
quality gains for the scorer — must be added by humans or per-issue follow-ups:

| Field | Recommended convention |
|---|---|
| `estimatedComplexity` | `S` (≤ 1h, single file), `M` (a few files), `L` (multi-day), `XL` (split first) |
| `suspectedFiles` | path globs the AC implies, max 5–8 |
| `expectedValidationCommand` | the exact `pnpm` command Claude should run before declaring done |
| `dependsOn` | other open issue numbers that must close first |
| `blockingCriteria` | one-liners describing what would force a stop (e.g. "needs Stripe key") |

Once these are filled (manually or via a follow-up `task:meta:enrich`
script), the scoring formula will rank issues much more discriminatively
than the current ±60-point spread.

## How to apply when you're ready

```
pnpm task:meta:backfill -- --yes --confirm "I MEAN IT"
```

Both flags are required by design. `--yes` triggers writes; `--confirm "I
MEAN IT"` prevents accidental autocomplete. Without either, the script stays
in dry-run.

## Verification after apply

```
pnpm task:score --top 5
# expect: every issue now shows "+20 AC verified <Nd> ago" instead of
# "-40 no acLastVerifiedAt"
```

## Reverting

If a backfill goes wrong, `gh issue edit <N> --body "<previous body>"` rolls
back per issue. There is no batch revert because the previous bodies are
known to GitHub history (`gh api repos/{owner}/{repo}/issues/<N>/timeline`).
