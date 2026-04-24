# AI Issue Execution Protocol — WebAppV1

Mandatory protocol for any AI agent executing a GitHub issue in this repo. Every step is a hard gate.

## 0. Inputs

- An issue number `#N` assigned to you.
- This repo at `main` (or a base branch explicitly named in `#N`).
- Credentials: `gh` authenticated with `repo` + `project` scopes (already configured).

## 1. Read the issue

- `gh issue view N --json title,body,labels,assignees,url`
- Read `body` in full, not summaries. Do not infer missing acceptance criteria.
- If the issue is vague, missing Goal / AC / Out-of-scope — **stop and ask**. Do not invent scope.

## 2. Check risk and autonomy labels

Labels drive every decision below.

| Combination | Allowed |
|---|---|
| `ai:autonomous` + `risk:safe` | Run through to PR without human check-in. |
| `ai:autonomous` + `risk:review-required` | Run through to PR; **wait for human review on the PR** before merging. |
| `ai:human-checkpoint` (any risk) | Stop after step 5 (plan). Present the plan. Wait for OK before coding. |
| `risk:destructive` (any ai) | Stop immediately. Ask for explicit confirmation naming the destructive action. |

If labels are missing, treat as `ai:human-checkpoint` + `risk:review-required`.

## 3. Move issue to "In Progress"

- Set Project #1 `Status` = `In Progress` via `gh project item-edit` (or have Yume click if tooling not available at run time).
- Comment on the issue: `"Starting execution — branch: feat/<scope>-<slug>-#N"`.

## 4. Create branch

- Branch name: `feat/<area>-<short-slug>-#N`, e.g. `feat/api-drizzle-migrations-#23`.
- From `main` unless the issue says otherwise.
- `git switch -c <branch>`.

## 5. Plan

Before coding, write a short plan (4–10 bullets) covering:
- Files to touch.
- Files explicitly out of scope.
- Test approach.
- Any new dependency.

If `ai:human-checkpoint`: **post the plan as a comment on the issue and stop**. Resume only after Yume replies OK.

## 6. Code

- Respect `CLAUDE.md` rules: no comments unless non-obvious, no abstractions beyond scope, no features not in AC.
- Do **not** touch files outside the area declared by the issue unless the AC forces it.
- Keep changes reviewable: prefer small diffs.

## 7. Test

- Run the repo's checks locally before opening a PR:
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm test`
  - `pnpm build` if backend or types package changed.
- For any new code, add a test covering the AC unless the AC says "no test".
- Do **not** merge through failing checks. If a pre-existing failure blocks you, stop and surface it.

## 8. Commit and push

- Conventional commits, scope = area: `feat(api): …`, `fix(web): …`, `chore(ci): …`.
- One logical change per commit when feasible.
- `git push -u origin <branch>`.

## 9. Open PR with `Closes #N`

- `gh pr create --base main --fill --body` containing:
  - First line: `Closes #N`.
  - Mirror of the issue's AC as a checklist — each box ticked must be literally true.
  - Test plan summary.
- Add reviewer if the issue is `ai:human-checkpoint` or `risk:review-required`.

## 10. Move issue to "Review"

- Set Project #1 `Status` = `Review` on the issue (not the PR).
- Post a comment: `"PR: <url>"`.

## 11. Propose follow-ups via a delta file

While working you may have discovered **at most 5** follow-up tasks. Do **not** inline them in the current PR. Instead:

1. Write `project-memory/backlog/issues.delta.json` (pattern in `issues.delta.example.json`).
2. Each new issue has a stable `externalKey` so re-runs don't duplicate.
3. Fields must satisfy the guardrails in `issues.delta.schema.md`.
4. **Never** add anything under `apps/` or `packages/` in this step.

Zero follow-ups is a valid outcome. Do not invent busywork.

## 12. Dry-run the delta

- `pnpm issues:delta:dry-run`
- Report to Yume: number to create, duplicates, any rejection reason.
- Stop here.

## 13. Apply the delta — auto-apply rule

The decision is deterministic. Check every follow-up in the delta:

**Auto-apply path** — you run `pnpm issues:delta:apply` without asking, IF AND ONLY IF **every** follow-up satisfies **all** of:
- label `risk:safe` present
- label `ai:autonomous` present
- labels `risk:review-required`, `risk:destructive`, `ai:human-checkpoint` **absent**
- `issues.length` ≤ 5 (already enforced by the script — fail-closed)

Procedure on the auto path:
1. `pnpm issues:delta:dry-run` — read the output.
2. If `to create > 0` and `duplicates` lines match expectation and no rejection: `pnpm issues:delta:apply`.
3. If dry-run prints a REJECT or any `✗`: **stop**, do not apply, surface the failure in the final report.

**Hold-for-human path** — you run the dry-run then stop, IF ANY follow-up has:
- `risk:review-required`, OR
- `risk:destructive` (these must **never** be auto-applied — destructive is always human-gated), OR
- `ai:human-checkpoint`, OR
- missing either `risk:safe` or `ai:autonomous`.

When holding, the final report must contain:
- The delta file path: `project-memory/backlog/issues.delta.json`.
- The command Yume runs to approve: `pnpm issues:delta:apply`.
- The specific reason per issue that disqualified auto-apply.

**Mixed delta rule.** A single `risk:review-required` / `risk:destructive` / `ai:human-checkpoint` in the delta disqualifies the **entire** delta from auto-apply. Do not split the delta to get the safe subset through — that hides the mixed intent. Either rewrite the delta so every item is safe+autonomous, or hold the whole thing.

## 14. Final report

End your session with:
- Issue executed: `#N`.
- Branch, PR URL.
- Checks run and their status.
- Project status transitions done (Todo → In Progress → Review).
- Delta: N follow-ups proposed, decision (`AUTO-APPLIED` / `HOLD — reason`).
- If auto-applied: list of created issues with URLs and issue numbers.
- If held: the disqualifying labels per follow-up and the command Yume runs.
- Anything Yume must still click (merging the PR, approving a human-checkpoint, etc.).

## Rules that never bend

- No force push. No `git reset --hard` on shared branches.
- No merging your own PR unless it is `ai:autonomous` + `risk:safe` **and** Yume has pre-approved auto-merge on that label in settings (currently: no).
- Never modify `project-memory/backlog/issues.json` (the source backlog) — follow-ups go in `issues.delta.json`.
- Never create GitHub issues outside `tools/create-github-issues.mjs` or `tools/apply-issue-delta.mjs`.
- Never skip hooks (`--no-verify`).
