# Local Control — V5

This is the V5 (Phase 5) layer on top of the local-control cockpit. It wires
Claude Code (the `yu` shell function) into the runner, persists per-run state,
and exposes a readiness card in the UI.

## Lancer V5

```bash
pnpm local:control
```

Open `http://127.0.0.1:8787`. Paste the auth token from
`.local-control/settings.json` (field `authToken`). The Dashboard now shows a
**V5 readiness** card with these rows:

- Claude CLI — `available` if `CLAUDE_CODE_COMMAND` (e.g. `yu`) is in `PATH`
- Exec / Loop / Auto-merge — toggles from Settings
- Notion / n8n / WhatsApp — green when env keys are set

## `.local-control/v5.env`

Already present. Required keys for the V5 base:

```
CLAUDE_CODE_COMMAND=yu
CLAUDE_CODE_MODE=cli
GITHUB_OWNER=Yuume2
GITHUB_REPO=WebAppV1
```

Phase 3 dependencies (optional — degraded mode if missing):

```
NOTION_TOKEN=
NOTION_QUESTIONS_DATABASE_ID=

N8N_BASE_URL=
N8N_WEBHOOK_SECRET=
N8N_QUESTION_NOTIFY_WEBHOOK=
N8N_NOTION_ANSWER_WEBHOOK=

WHATSAPP_PROVIDER=
WHATSAPP_FROM=
WHATSAPP_TO=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
```

`.local-control/` is git-ignored. Never commit secrets.

## Tester sans risque

1. Start the server, paste token.
2. In V5 readiness card, type an issue number and click **Prepare Claude run**.
3. Server returns:
   - a generated prompt (saved to `.local-control/runs/<runId>.json`),
   - the proposed branch name,
   - the proposed git/gh commands.
4. Click **Copy prompt** and paste it into a terminal where `yu` is available.
5. Nothing is executed automatically. No push. No merge.

This is the safe default. The runner never spawns `yu` directly.

## Passer en vrai mode exec (avancé)

Switch a real Claude Code run on only when you are watching:

1. In Settings, enable **Allow exec**. Save.
2. Click **Plan next task** on the Dashboard. The runner spawns `pnpm task:run:plan --issue=...` (no Claude Code CLI yet — V5 prompt-driven path).
3. Real Claude Code execution stays manual: copy the prepared prompt and run it
   yourself in a terminal. This keeps the loop human-supervised.

## Notion / n8n / WhatsApp

If empty, the cockpit shows `not configured` and the system runs in **GitHub-only
mode** for human questions. To activate:

- Notion: fill `NOTION_TOKEN` and `NOTION_QUESTIONS_DATABASE_ID`. See
  `docs/ops/notion-sync.md`.
- n8n: fill `N8N_BASE_URL` + secret. See `docs/ops/notion-whatsapp-live.md`.
- WhatsApp: fill provider + Twilio creds. See `docs/ops/whatsapp-notif.md`.

Restart the cockpit after editing `.local-control/v5.env`.

## Auto-merge

Stays **OFF** by default. The cockpit refuses `/api/automerge/apply` when
`allowAutoMerge=false`. Even when on, `/api/automerge/check` runs first and the
server never uses `gh pr merge --admin`.

## Endpoints V5

- `GET /api/v5/status` — readiness JSON (Claude, env groups, phase status, next actions).
- `POST /api/v5/prepare-run` — body `{ issue, mode }`, persists to `.local-control/runs/<id>.json`, returns prompt + proposed branch + commands.
- `GET /api/state` — list of prepared/past runs (newest first).
- `POST /api/resume` — body `{ runId? }`, returns `{ canResume, reason, runId, issue, mode }` based on answered questions.

## Tests

```
pnpm local:control:test
pnpm local:control:ui:test
```
