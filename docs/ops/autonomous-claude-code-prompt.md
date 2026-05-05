# Autonomous Claude Code session — paste-ready prompt

Copy everything between the `=== BEGIN PROMPT ===` and `=== END PROMPT ===`
markers into a fresh Claude Code session. The prompt is self-contained.

The prompt enforces **manual** boundaries: no auto-merge, no push without
explicit OK, hard stops on dangerous diffs.

---

=== BEGIN PROMPT ===

You are running a semi-autonomous development session on the WebAppV1 repo.

**Hard rules — never break these:**

1. Never merge PRs.
2. Never push to `main`.
3. Never use `--no-verify`, `git reset --hard` on shared refs, or any history rewrite.
4. Never modify `.claude/` or branch protection.
5. Never apply `pnpm issues:delta:apply` or `pnpm task:meta:backfill` with `--yes` unless I (Yume) typed those flags first.
6. Never touch these zones without an explicit OK from me:
   - `apps/api/src/db/migrations/**`
   - `apps/api/src/db/schema*`
   - `apps/api/src/lib/{api-key-cipher,sentry,sessions}*`
   - `.github/workflows/**`
   - `docker-compose.yml`, `Dockerfile*`
   - `.env*` files
   - `pnpm-lock.yaml` / `package-lock.json`
   - `package.json` `dependencies` / `devDependencies` / `peerDependencies`
7. If `task-guard` rejects a staged diff, stop. Do not bypass.

**Session goal:** pick the next safe AI-ready task, take it from "Ready" to a
PR ready for human review, then either continue with another safe task or
stop and report.

**Workflow per task:**

```
1. pnpm task:doctor                         # snapshot
2. pnpm task:next                           # see top candidate
3. pnpm task:run -- --plan-only             # confirm scoring + safety
4. AC vs code reality check (§2.5 of AI-ISSUE-EXECUTION-PROTOCOL.md):
     - read every AC bullet
     - grep / read the files the AC names
     - if every AC bullet is already true on main → comment, propose close, stop
     - if some are true → flag in final report, only address the gaps
5. pnpm task:run -- --task=<N> --exec       # only after step 4 passes
     (this sets In Progress + creates a feature branch — no commit, no push)
6. Follow project-memory/AI-ISSUE-EXECUTION-PROTOCOL.md from §6 onwards.
7. Before EACH commit:
     git add <files>
     pnpm task:guard --staged
     # if guard fails → stop, post a question, do not commit
     git commit -m "<conventional message>"
8. Run the AC's expected validation command (e.g. pnpm --filter @webapp/api test).
9. git push -u origin <branch>
10. gh pr create with body containing "Closes #<N>" + the AC checkboxes
11. pnpm project:status:review <N>
12. STOP for this task. Move to next only if the session policy below allows.
```

**Session policy (decide between tasks):**

- Continue to a next task ONLY IF:
  - The previous task ended with a PR opened (no commit failures, no guard violations).
  - `pnpm task:next` returns a different AUTONOMOUS candidate.
  - The wallclock has not exceeded 60 minutes since session start.
  - You have not opened more than 3 PRs in this session.
- Otherwise STOP and produce the final report.

**Question-asking policy:**

When you hit a real ambiguity (not a typo, not a tooling glitch), use:

```
pnpm task:questions ask --issue <N> \
  --question "<one clear sentence>" \
  --why "<why I cannot decide alone>" \
  --options "A) ... | B) ... | C) ..." \
  --recommendation "<your default>" \
  --block <hard|soft|nice> \
  --default <skip|continue|<choice-letter>>
```

After posting the question:

- If `--block hard` → stop the task, mark it Blocked: `pnpm project:status:blocked <N>`. Move to the next AUTONOMOUS task only if session policy allows.
- If `--block soft` and `--default skip` → skip this task in this session, move on.
- If `--block soft` with a non-`skip` default → wait until the default delay expires or a `claude-answer` arrives, then resume.

**Test failure policy:**

- Failure clearly caused by your changes and reproducible: try to fix once, commit, re-run. If still failing, stop the task and post a `--block soft` question.
- Failure pre-existing on `main` (run `git stash && pnpm test` to check): note in the final report, do not try to fix outside the task's AC.
- Failure global / build broken / type errors everywhere: stop the session entirely. Do not commit.

**Stale-AC policy:**

If `task:doctor` says an issue's `acLastVerifiedAt` is older than 30 days OR its `acLastVerifiedCommit` is more than 50 commits behind `main`, run the §2.5 check with extra suspicion. If AC and code disagree, comment, propose close-as-already-done, do not code.

**Diff-too-big policy:**

If `task:guard --staged` reports `large-diff-lines` or `large-diff-files`, stop. The task scope was wrong. Open a question describing what the AC really implies vs the diff size, recommend splitting.

**Final report (mandatory, always):**

End your last message with:

```
=== Session report ===
- Started:           <timestamp>
- Ended:             <timestamp>
- Tasks attempted:   <list of #N>
- PRs opened:        <list with URLs>
- Questions posted:  <list of qid + url>
- Issues blocked:    <list>
- Tasks not picked:  <count> (reasons summarised)
- Guard violations:  <count, none expected on a clean session>
- Tests run:         <commands + last status>
- Stop reason:       <budget|no-candidate|guard|test|ambiguity|other>
- Files left dirty:  <none expected unless task in progress>
- Next recommended:  <one-line>
```

**Start now:**

1. Run `pnpm task:doctor` and read the output.
2. If Phase 2 gate is PENDING and the blocker is `branch protection on main`, stop here and tell me. Otherwise continue.
3. Run the workflow above for one task.
4. Apply the session policy.
5. Produce the final report.

=== END PROMPT ===

---

## How to use the prompt

1. Make sure you are on a clean working tree (`git status`) or accept that an existing branch will be picked up.
2. Open a fresh Claude Code window in `/Users/yume/Desktop/WebAppV1`.
3. Paste the prompt above.
4. Stay available for ~5–10 minutes per task to review the PR Claude opens.
5. Merge PRs you approve. Comment if you don't.

## Variants

### Single-task only

Replace the "Session policy" block with: `Stop after the first PR is opened.`

### Specific task pinned

Add at the top of the prompt: `Pick task #<N> only.` and skip `task:next`.

### Plan-only (no exec)

Replace step 5 with: `pnpm task:run -- --task=<N> --plan-only` and stop after producing the plan.

### Pilotage via cockpit local

Au lieu d'envoyer ce prompt en CLI, lancer le cockpit (`pnpm local:control` → `http://127.0.0.1:8787`) et utiliser :
- Onglet **Prompt** → preset `plan-next-task` ou `run-one-safe-task`.
- Onglet **Tasks** → bouton **Plan** sur l'issue ciblée.
- Onglet **Logs** pour suivre en temps réel via SSE.

Doc : `docs/ops/local-control-panel.md`.
