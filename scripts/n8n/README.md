# n8n workflows for WebAppV1

n8n is the bridge between GitHub (source of truth), Notion (mobile UI), and
WhatsApp (push notifications). The workflows live as exportable JSON files in
this directory so they can be re-imported into any n8n instance.

**Status today**: not deployed. Files here are templates Yume can import into
`yumeee.app.n8n.cloud` once the secrets are ready.

## Workflows

| File | Purpose | Phase |
|---|---|---|
| `webappv1-question-to-whatsapp.json` | When Claude posts a `claude-question` GitHub comment, push a WhatsApp notification | 3 |
| `webappv1-notion-answer-to-github.json` | When `Status=answered` flips in the Notion Questions DB, post the answer back to the GitHub issue | 3 |
| `webappv1-pr-merged-summary.json` | When a PR closes via merge, send a WhatsApp summary | 4 (later) |

All workflows are **manual / event-triggered**, no cron, no auto-scheduled
agent run. The only cron in scope is `webappv1-notion-answer-to-github.json`
which polls Notion every 5 minutes (Notion has no webhook).

## Required credentials in n8n

Create these credentials inside the n8n cloud workspace before importing:

- `webappv1-github` — GitHub PAT with `repo` scope. Used to POST issue comments.
- `webappv1-notion` — Notion integration token shared with the Tasks AND Questions DBs.
- `webappv1-whatsapp` — Twilio (WhatsApp sandbox to start) or Meta Cloud API.

Never paste raw tokens into the JSON. Use n8n's credential references.

## Required env / variables in n8n

| Name | Purpose |
|---|---|
| `WEBAPPV1_REPO` | `Yuume2/WebAppV1` |
| `NOTION_QUESTIONS_DB_ID` | UUID of the Questions database |
| `WHATSAPP_TO` | E.164 phone number receiving notifications |
| `WHATSAPP_FROM` | Twilio sandbox or Meta-approved sender |

## Importing a workflow

1. n8n → Workflows → "+" → Import from File.
2. Pick the JSON file in this directory.
3. Open every node; map credentials and variables.
4. Save as **inactive**.
5. Run once with a fixture (a fake GitHub webhook payload, or a Notion DB row).
6. Activate only after the fixture run is clean.

## Security checklist

- All n8n webhooks require a shared secret in the URL or in a header. Use a
  random 32-byte string. Rotate yearly.
- Trigger nodes that hit GitHub must use the `webappv1-github` credential, not
  Yume's personal token.
- WhatsApp notifications must NOT include issue body text — only `qid`, issue
  number, title, and a deep link. Sensitive AC stays out of WhatsApp logs.
- Notion → GitHub direction must guard against duplicates. Check whether a
  `claude-answer qid: <qid>` comment already exists before posting.

## Phase 4 (later)

A `/run` command via WhatsApp would let Yume trigger the GitHub Actions
`task-runner.yml` workflow remotely. This is **not implemented**. When ready:

1. Create a WhatsApp inbound webhook in n8n.
2. Verify the message text exactly matches `/run` (or `/run #N`).
3. Verify the sender phone equals `WHATSAPP_TO`.
4. Call `gh api repos/<repo>/actions/workflows/task-runner.yml/dispatches`.

Until then, Yume triggers the workflow manually from the GitHub UI.
