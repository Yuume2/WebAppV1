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

## Background lifecycle (V5 réel)

L'engine tourne en arrière-plan dans le serveur cockpit tant qu'il est
ouvert. Le state est persisté dans `.local-control/runs/<id>.json`.
L'UI se reconnecte automatiquement via SSE (`/api/autopilot/events`)
quand un run est actif.

Cycle d'une itération autopilot en mode exec :

1. `git switch main && git pull --ff-only`
2. `git switch -c feat/issue-<n>-autopilot`
3. lance `claude -p "<prompt>"` via la commande `yu` configurée
4. attend la fin du process en streamant stdout/stderr
5. lance `task-guard --json` — abandonne si BLOCK
6. cherche la PR ouverte sur la branche (`gh pr list --head ...`)
7. si PR créée → enregistre + budget PR++ + boucle si `allowLoop=true`
8. si pas de PR mais commentaire `claude-question` → état `waiting`
9. si rien des deux → comptabilise comme erreur

Stop conditions :
- `stopRequested` (bouton Stop)
- `errors >= maxErrors`
- `prsCreated >= maxPrsPerRun`
- `Date.now() - startedAt > maxMinutes * 60_000`
- `guard-block`
- `human-question` (state waiting, requiert Resume)
- `no-safe-task`

## Lancer en CLI

```bash
pnpm autopilot          # run-one (refuse si allowExec=false)
pnpm autopilot:loop     # loop (refuse si allowLoop=false)
pnpm autopilot --issue=41   # forcer une issue précise
```

Le CLI lit `.local-control/settings.json`, démarre le serveur cockpit
en headless, puis appelle `/api/autopilot/start`. Ctrl+C envoie un
`stop` propre.

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

## Unattended loop mode

When `allowLoop=true` and a loop mode (`auto5`, `loop10`, `loop20`, `custom`) is
launched, the engine runs unattended until budget reached or queue exhausted.

### State fields tracked per run

| Field | Meaning |
|---|---|
| `unattended` | true when launched in loop mode |
| `plannedTasks` | nominal target (maxPrsPerRun or custom) |
| `completedIssues[]` | issues that produced a PR |
| `failedIssues[]` | issues that failed in this run (excluded from re-pick) |
| `skippedIssues[]` | issues skipped by guard / preflight / dedup |
| `createdPrs[]` | full PR records: number, url, title, branch, issueNumber |
| `attempts{}` | per-issue attempt count (capped by `maxRetriesPerIssue`) |
| `missionReport` | structured final report attached on stop |

### Failure handling

Per-issue failures **do not** stop the loop. The engine:

1. Records the failure in `failedIssues[]` with reason + last stderr snippet.
2. Leaves the branch in place (you can inspect later).
3. Excludes the issue from `_pickIssue` for the rest of the run.
4. Continues until budget or `no-safe-task`.

Cross-run failures (preflight, repo dirty, claude CLI missing) still stop the
mission immediately — those need human intervention.

### Stop reasons

- `completed` — natural end (loop done or one-shot success).
- `pr-budget-reached` — `maxPrsPerRun` hit.
- `error-budget-exceeded` — `maxErrors` (default 3) accumulated.
- `time-budget-exceeded` — `maxMinutes` exceeded.
- `no-safe-task` — queue exhausted, nothing safe left.
- `human-question` — Claude posted a question, run is `waiting`.
- `stopped-by-user` — manual stop via cockpit.

### Mission report

Built by `buildMissionReport(run)` and exposed as `run.missionReport`. Surfaces:

- `outcome`: completed / partial / failed / stopped / waiting.
- `summary`: human sentence (FR).
- `prsCreated`, `failedCount`, `skippedCount`, `attempted`, `durationMs`.
- `createdPrs[]` for UI list rendering.
- `failedIssues[]` with reason + detail.
- `nextAction`: contextual instruction for the operator.
- `autoMergeAllowed`: snapshot of `settings.allowAutoMerge`.

The report is also returned by `GET /api/autopilot/status` under
`missionReport` so the UI persists it after refresh.

### Notifications

`MissionNotifier` (`integrations/notifier.mjs`) emits five events:

- `mission_started`
- `pr_created`
- `issue_failed`
- `question_required`
- `mission_completed`

Each event is dispatched to whichever providers are configured (n8n webhook,
Notion, WhatsApp). Missing providers don't crash — they return
`{ ok: false, reason: 'X not configured' }` per dispatch entry.

Endpoint `GET /api/autopilot/notifier` returns the provider status + recent
events for the cockpit to display.

### Auto-merge stays OFF

`allowAutoMerge=false` is the default. The mission report's `nextAction` always
asks the operator to review/merge manually. Even if `allowAutoMerge=true` is
flipped, this PR does not exercise auto-merge — that lives in `automerge.mjs`
behind the existing safety gates and never uses `--admin`.

## Why exec mode is restricted by default

`yu` is wired to the real Claude Code CLI on this machine. Running it from a
backend means real edits, real commits, real pushes. We default to dry-run
(`allowExec=false`) so the cockpit only produces a prompt and Yume runs Claude
in a terminal. Flip `allowExec=true` only when you trust the queue, the guard,
and the branch-protection ruleset on `main`.
