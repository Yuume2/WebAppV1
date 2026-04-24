# Prompt — Execute a GitHub issue end-to-end

Copy-paste this prompt into Claude. Replace `<N>` with the real issue number.

---

You are executing **GitHub issue #<N>** on the WebAppV1 repo.

Follow `project-memory/AI-ISSUE-EXECUTION-PROTOCOL.md` **strictly**. Do not skip steps. Do not invent scope. Do not touch files outside what the issue calls for.

## Preflight (do these first, in order)

1. `gh issue view <N> --json title,body,labels,assignees,url` — read the whole body.
2. `git status` — abort if dirty; do not auto-stash.
3. Confirm labels follow the taxonomy (`role:`, `type:`, priority `P*`, `ai:*`, `risk:*`). Missing labels → treat as `ai:human-checkpoint` + `risk:review-required`.

## Safety gates

- `risk:destructive` → **STOP**. Post the destructive action on the issue and wait for Yume's explicit confirmation.
- `ai:human-checkpoint` → produce the plan only (step 5 of the protocol), post as issue comment, **stop**.
- Anything outside `apps/`, `packages/`, `.github/`, `docs/`, `tools/`, `project-memory/` → **stop and ask**.
- Do not modify `project-memory/backlog/issues.json`. Propose follow-ups via `issues.delta.json` only.

## Execution

Run the numbered cycle in the protocol: read → **AC vs code reality check (§2.5)** → `pnpm project:status:in-progress <N>` → branch → plan → code → test → commit → push → PR with `Closes #<N>` → `pnpm project:status:review <N>`.

If at any point the work becomes impossible (missing dep, blocked env, irreversible ambiguity): `pnpm project:status:blocked <N>`, comment the blocker, stop.

Never leave the issue in `In Progress` without work in flight.

## Follow-ups (delta)

If and only if you discovered concrete, out-of-scope follow-ups (cap: 5):

1. Write `project-memory/backlog/issues.delta.json` following `issues.delta.example.json` and `issues.delta.schema.md`. Mandatory per follow-up: `title`, `body`, `labels`, `owner`, `area`, `priority`, `status`, `sourceIssue`, `reason`, `externalKey` (stable & unique). Include `dependsOn` when one follow-up truly gates another.
2. Run `pnpm issues:delta:dry-run` and read its output.

**Auto-apply decision (deterministic — no asking):**

- If **every** follow-up has `risk:safe` AND `ai:autonomous`, AND none has `risk:review-required` / `risk:destructive` / `ai:human-checkpoint`, AND the dry-run is clean → run `pnpm issues:delta:apply` directly. Report the created issues with their URLs.
- Otherwise → **stop after the dry-run**, do not apply, wait for Yume's OK. Report the disqualifying label per follow-up.

**Absolute rule:** a follow-up tagged `risk:destructive` is never auto-created, even alone, even if also `ai:autonomous`. It always waits for a human.

**Mixed-delta rule:** one disqualifying follow-up disqualifies the whole delta. Do not split to push the safe subset through.

Zero follow-ups is fine. Do not pad.

## Final report — mandatory

End your last message with this exact structure:

```
### Report — issue #<N>
- Branch: <name>
- Commits: <n>
- PR: <url>
- Checks: typecheck=<ok|fail> lint=<ok|fail> test=<ok|fail> build=<ok|fail|skipped>
- Project transitions: Todo → In Progress → Review
- Follow-ups proposed: <n>  (file: project-memory/backlog/issues.delta.json)
- Auto-apply decision: <AUTO-APPLIED | HOLD — reason>
- Follow-up issues created: <list of #N + URLs, or "none">
- Human action needed: <list OR "none">

```

## Hard rules

- No force-push, no `reset --hard` on shared refs, no skipped hooks.
- No self-merge. Yume merges.
- No new scripts, dependencies, or architecture not required by the AC.
- If anything in the issue is ambiguous, stop and ask. Don't guess.
