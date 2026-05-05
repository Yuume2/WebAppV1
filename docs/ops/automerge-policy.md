# Auto-merge Policy

Auto-merge is **OFF by default** and stays OFF until a human flips
`allowAutoMerge=true` in cockpit settings. Even when ON, every merge is
gated by the checks below. If any single check fails, the merge is refused
and the cockpit reports the reason.

## Required for a PR to be auto-mergeable

- `allowAutoMerge=true` in `.local-control/settings.json`.
- PR is OPEN and not draft.
- All status checks green (`statusCheckRollup` has no FAILURE/CANCELLED/PENDING).
- PR has a linked issue (`closingIssuesReferences`).
- Linked issue carries both `ai:autonomous` and `risk:safe` labels.
- Branch protection on `main` is active (classic protection or ruleset).
- `task:guard` returns ALLOW for the PR diff.
- Diff is ≤ 25 files and ≤ 400 lines added+deleted.
- No sensitive paths (`.env`, `apps/api/db/`, `apps/api/auth/`, `infra/`,
  `package.json`, `pnpm-lock.yaml`, `Dockerfile`, GitHub workflows…).
- No reviewer requested changes.

## Always refused

- `risk:destructive` or `risk:review-required` labels.
- `ai:human-checkpoint` label.
- Any `.env*` or secret-bearing path.
- Database migrations that drop or rename columns.
- Billing or auth/security disablement.
- Anything requiring `--admin` to merge.
- CI red or pending.

## How to enable

1. Settings → flip `allowAutoMerge` to true.
2. Test on one PR via cockpit Advanced → Auto-merge check.
3. Inspect the report's `reasons` array. Empty array = eligible.
4. Click Auto-merge apply only if you've read the diff yourself.

## Endpoints

- `POST /api/automerge/check` — dry-run, returns `eligible` and `reasons`.
- `POST /api/automerge/apply` — refuses if `allowAutoMerge=false` or any
  check fails.
