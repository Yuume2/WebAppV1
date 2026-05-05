# Branch protection checklist — `main`

Required before Phase 2 `--exec` is enabled. Until this is in place, the
runner refuses `--exec` and `task-doctor` keeps the Phase 2 gate as PENDING.

**Claude does not modify branch protection.** This is a deliberate manual
action by Yume in the GitHub UI.

## Why

Without protection, an automated agent (or any contributor) can push directly
to `main`, force-push, or merge a PR without CI green. Phase 2 commits land in
PRs, so we want server-side enforcement of the review path.

## Verification commands

Read-only, safe to run anytime:

```bash
gh api repos/Yuume2/WebAppV1/branches/main/protection
# → expected after setup: a JSON object describing rules
# → today: 404 "Branch not protected"

gh api repos/Yuume2/WebAppV1/rules/branches/main
# → lists rulesets that apply to main, if any
```

## What to enable on `main`

Settings → Branches → Add rule (or Add ruleset on a recent repo).

| Setting | Value | Why |
|---|---|---|
| Branch name pattern | `main` | the protected branch |
| Require a pull request before merging | **on** | no direct push |
| └ Required approvals | `0` (you're solo) or `1` if you bring a reviewer | bumping later is fine |
| └ Dismiss stale pull request approvals when new commits are pushed | **on** | avoid review-after-rewrite |
| └ Require review from Code Owners | off (no CODEOWNERS file yet) | defer until CODEOWNERS exists |
| Require status checks to pass before merging | **on** | gate on CI |
| └ Require branches to be up to date before merging | **on** | avoid stale-base regressions |
| └ Status checks that are required | `ci` (the job from `.github/workflows/ci.yml`) | the only mandatory check today |
| Require conversation resolution before merging | **on** | force comment loops to close |
| Require signed commits | optional | only if you sign your commits today |
| Require linear history | **on** (recommended) | block merge commits, keep `main` linear |
| Require deployments to succeed before merging | off | no deploy job yet |
| Lock branch | off | a lock blocks even authorised PRs |
| Do not allow bypassing the above settings | **on** | including admins; otherwise the agent could bypass |
| Restrict who can push to matching branches | **on** | empty list = nobody pushes directly |
| Allow force pushes | **off** | prevents history rewrites |
| Allow deletions | **off** | prevents accidental branch delete |

## Auto-merge policy

Keep auto-merge **disabled** for now. Phase 4 may revisit this once the loop
runner is proven; until then, every merge is a manual click by Yume.

## CODEOWNERS (optional, later)

Create `.github/CODEOWNERS` with per-directory ownership when you bring
collaborators. Until then, skip the "Require review from Code Owners" setting.

## After enabling

Verify:

```bash
gh api repos/Yuume2/WebAppV1/branches/main/protection \
  | jq '.required_pull_request_reviews, .required_status_checks, .allow_force_pushes, .allow_deletions'
```

Then run:

```bash
pnpm task:doctor
# → expect "main is protected" and Phase 2 gate flips to READY
```

## Rollback

If a setting breaks your workflow, Settings → Branches → Edit rule. No code
change required.
