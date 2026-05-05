# Local-Control Autopilot

The Autopilot is the V5 orchestration loop that drives Claude Code from the
local cockpit. It picks the safest open task, builds the prompt, hands off
work to Claude (via `yu`), and stops as soon as a guard fails.

## What Autopilot does

1. Preflight: repo clean, on `main`, env loaded, Claude CLI available.
2. Pick a safe task from the GitHub queue (filters `risk:destructive`,
   `risk:review-required`, `ai:human-checkpoint`; requires `ai:autonomous` +
   `risk:safe`).
3. Build a structured prompt for the issue (no secrets, no shell injection).
4. Either:
   - **Plan mode** (default, `allowExec=false`): produce the prompt, surface
     it in the cockpit. Yume copies and runs `yu` manually.
   - **Exec mode** (`allowExec=true`): launch `yu` via login zsh, stream
     stdout/stderr back, watch stop conditions.
5. Stop on any of: dirty repo, guard BLOCK, 3 errors, time budget, PR budget,
   pending human question, missing secret, push to main, `--admin`.

## Stop conditions

| Reason | Trigger |
|---|---|
| `repo-dirty` | uncommitted changes detected at start |
| `no-safe-task` | queue empty or all filtered out |
| `guard-block` | `task:guard` returned BLOCK |
| `human-question` | Claude posted a `claude-question` comment |
| `error-budget-exceeded` | 3 consecutive errors |
| `time-budget-exceeded` | run duration > `maxMinutes` (default 60) |
| `pr-budget-reached` | `prsCreated >= maxPrsPerRun` (default 3) |
| `secret-missing` | required env var empty |
| `claude-unavailable` | `yu` not found in `$PATH` |
| `exec-disabled` | `allowExec=false` and mode != plan |

## Endpoints

- `POST /api/autopilot/start` — body `{ mode, issue? }`. mode in
  `plan|exec|loop`. Returns the run summary and the prompt.
- `POST /api/autopilot/stop` — terminates the active run.
- `POST /api/autopilot/resume` — resumes after a question is answered.
- `GET  /api/autopilot/status` — current run summary or null.
- `GET  /api/v5/status` — global readiness (Claude / Notion / n8n / WhatsApp).

## Settings that gate Autopilot

- `allowExec` — false by default. Required for any mode beyond `plan`.
- `allowLoop` — false by default. Required for `mode=loop`.
- `allowAutoMerge` — false by default. Auto-merge stays OFF unless flipped.
- `maxMinutes` — 60 default, capped at 240.
- `maxPrsPerRun` — 3 default, capped at 10.

## First safe run (recipe)

1. Verify `pnpm task:doctor` is fully green (no PENDING blockers you can fix).
2. `pnpm local:control` and open `http://127.0.0.1:8787`.
3. Paste the auth token from `.local-control/settings.json`.
4. On the dashboard, leave Issue blank. Click **Start Autopilot**.
5. Read the prompt the cockpit generates. If it looks right, copy it and run
   `yu -p "<prompt>"` in another terminal.
6. Watch the PR appear. Resume with **Resume** if Claude asked a question.
7. Auto-merge stays OFF. Use the Advanced controls → Auto-merge check to
   evaluate eligibility, then flip `allowAutoMerge` deliberately.

## Why exec mode is restricted by default

`yu` is wired to the real Claude Code CLI on this machine. Running it from a
backend means real edits, real commits, real pushes. We default to dry-run
(`allowExec=false`) so the cockpit only produces a prompt and Yume runs Claude
in a terminal. Flip `allowExec=true` only when you trust the queue, the guard,
and the branch-protection ruleset on `main`.
