# First semi-autonomous Claude session — operator's guide

This is the **runbook**. Print it, read it once, then run it.

The session is *semi*-autonomous: Claude picks the task, writes the code,
opens the PR. **Yume merges.** No automation crosses the merge boundary.

## Who does what

| Step | Actor | Notes |
|---|---|---|
| Decide a session is OK to run | Yume | Look at calendar, energy, monitoring |
| Run the prompt | Yume | Copy-paste from `autonomous-claude-code-prompt.md` |
| Pick the task | Claude | Via `pnpm task:next` + `task:run --plan-only` |
| Write code, run tests | Claude | Following `AI-ISSUE-EXECUTION-PROTOCOL.md` |
| Pre-commit guard | Claude | `pnpm task:guard --staged` before each commit |
| Open PR | Claude | Body must contain `Closes #N` and AC checkboxes |
| Move to Review | Claude | `pnpm project:status:review N` |
| Merge | **Yume only** | Always |
| Final report | Claude | At the end of the session, last assistant message |

## Prerequisites

- Working tree clean on `main` (or you're OK with the agent creating a new branch from current state).
- `gh auth status` says `Logged in`.
- `pnpm task:doctor` shows Phase 2 gate **READY** (or you accept the warnings).
- Branch protection on `main` enabled (see `branch-protection-checklist.md`).
- At least one open issue passes `pnpm task:next` filter.

## Session flow (operator view)

```
0. pnpm task:doctor                   # everything green?
1. pnpm task:next                     # who is next?
2. pnpm task:run -- --plan-only       # confirm scoring + safety + branch name
3. Paste the prompt from autonomous-claude-code-prompt.md into Claude Code
4. Watch Claude execute (chat output)
5. Claude opens a PR — review it
6. You merge (or ask for changes)
7. (Optional) pnpm task:doctor again to see what's next
```

You do not need to babysit step 4. You should look at the PR diff at step 5.

## How to read `pnpm task:score`

Each line shows:

- `#N [score=X]` — issue number and computed score.
- A status tag: AUTONOMOUS / REVIEW / EXCLUDED / TAKEN / UNCLEAR.
- A list of `+/-` reasons explaining the score.

Pick the top AUTONOMOUS line.

If no line is AUTONOMOUS, the queue is empty for the agent. Don't run a
session — pick a task yourself or seed new issues.

## How to read `pnpm task:deps`

Three groups:

- **Ready**: all declared deps are closed. Safe to start.
- **Blocked**: at least one open dep. Don't pick.
- **Cycles**: a real bug in dependency declarations. Fix manually.

If a candidate from `task:next` is in **Blocked**, the runner will refuse
`--exec` even with `--task=N`. The score is gated on deps too.

## How to decide if a task is executable

Claude does this automatically. As a human sanity check:

- Score > 0 ✓
- Class is AUTONOMOUS ✓
- AC mentions only files Claude can safely edit (no `apps/api/src/db/migrations`, no `lib/api-key-cipher`, etc. — see `task-runner.md` safety rules) ✓
- Body does not mention billing / Stripe / production data / drop / delete ✓
- All declared `dependsOn` issues are closed ✓
- AC verified at recent commit (`task-meta.acLastVerifiedCommit`) is within ~50 commits of current HEAD, or no large refactor since ✓

## How Claude posts a question

When blocked on an ambiguity, Claude runs:

```
pnpm task:questions ask --issue N \
  --question "..." --why "..." \
  --options "A) ... | B) ..." \
  --recommendation "..." \
  --block soft \
  --default skip
```

This posts a comment on the issue with the canonical marker
`<!-- claude-question v1 ... -->`. Phase 3 will mirror it to Notion.

For now, you answer by adding a comment starting with
`<!-- claude-answer qid: q-N-001 --> ...`

Or simply reply in chat — Claude will then run `pnpm task:questions resolve`.

## How Claude stops

Claude must stop and produce a final report when any of these happens:

- `task-guard` rejects a staged diff (denylist or size).
- AC mentions a forbidden zone (auth, billing, secrets, infra, prod, migration).
- Tests fail in a way Claude cannot fix in 1-2 honest attempts.
- A `risk:destructive` or `ai:human-checkpoint` label is on the chosen task (preflight catches this, but be ready).
- A merge conflict appears.
- Yume answers "stop" / "normal mode" / closes the chat.
- Score becomes ≤ 0 mid-execution (e.g. issue updated by humans).
- No more AUTONOMOUS candidate left.

The default behaviour is **stop-and-report**, not crash.

## After a PR is opened

```
1. Read the diff — never skip this for an automated PR.
2. Compare AC checkboxes vs actual diff.
3. If wrong → comment, request changes. Claude reopens or amends.
4. If right → merge. Squash or rebase per repo policy.
5. The merge auto-closes the issue (because of "Closes #N").
6. Check `pnpm task:doctor` again.
```

## What's interdit pendant la session

- Auto-merge — never.
- Touch `.claude/`.
- Modify branch protection.
- Push to `main` directly.
- Run `pnpm issues:delta:apply --yes` without dry-run first.
- Run `task:meta:backfill --yes` without reading the preview.
- Bypass `task-guard` (`--no-verify`, hand-edit the script, etc.).
- Use `git reset --hard` on shared refs.
- Force-push to the working branch once Yume reviewed.

## Failure modes — what to do

| Symptom | Action |
|---|---|
| Claude runs forever, no progress | Send "stop". Read `CLAUDE_NEEDS.md`. |
| PR diff has unexpected files | Reject; comment with the unexpected files; ask Claude to reduce scope. |
| Tests pass locally but CI fails | Fixable: ask Claude to investigate. Ambiguous: block the task, file a question. |
| Issue body changed mid-execution by a human | Stop. The AC just shifted. Restart from `task:next`. |
| Conflict with another open PR | Stop. Resolve manually or pick a different task. |

## Resuming after a stop

If a task is stuck mid-execution:

1. Branch is left as-is (no auto-cleanup).
2. Issue stays in "In Progress" or moves to "Blocked" via `pnpm project:status:blocked N`.
3. Next session can either pick up the same task (`pnpm task:run -- --task=N`) or move on.
4. Stale branches accumulate — clean weekly with `pnpm clean_gone` (already in `commit-commands` skill) or manually.
