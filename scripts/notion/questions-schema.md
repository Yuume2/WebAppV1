# Notion DB — Questions (schema)

Mirror of GitHub `claude-question` comments, used as the mobile interface for
human answers. **GitHub is still the source of truth.** Notion is the comfortable
keyboard.

## Properties

| Property name | Type | Notes |
|---|---|---|
| `Title` | Title | Equals `qid` (e.g. `q-41-001`). Must be unique. |
| `Task` | Number | The GitHub issue number (the task this question is about). |
| `GitHub URL` | URL | Direct link to the GitHub comment. |
| `Block level` | Select | Options: `hard`, `soft`, `nice`. |
| `Status` | Select | Options: `pending`, `answered`, `obsolete`. Default `pending`. |
| `Question` | Rich text | Mirror of question body (read-only suggestion). |
| `Recommendation` | Rich text | Claude's default recommendation. |
| `Answer` | Rich text | **Yume edits this.** Free-form text. |
| `Answer choice` | Select | Options: `A`, `B`, `C`, `D`, `default`, `skip`, `custom`. Optional shortcut for multiple-choice questions. |
| `Default if no answer` | Rich text | What Claude will do if no reply within `defaultDelayHours`. |
| `Created at` | Date | When Claude posted the question on GitHub. |
| `Answered at` | Date | When Yume answered. Bridge writes this on first non-empty `Answer`. |
| `Issue ID` | Number | Internal: GitHub comment id, used for idempotent updates. |
| `Last synced at` | Date | Set by the n8n bridge to detect stale rows. |

## Status transitions

```
pending → answered   (Yume types in Answer or sets Answer choice)
pending → obsolete   (Question no longer relevant; Claude or Yume can flip)
answered → answered  (idempotent — bridge tolerates re-syncs)
```

## Bridge contract

- Direction: GitHub → Notion is **create/update only**. Notion → GitHub is
  **append a single `claude-answer` comment** when `Status` becomes `answered`
  AND `Answer` is non-empty.
- Idempotent: keyed by `Title` (qid) and `Issue ID`.
- No deletes from either side. Obsolete rows stay for traceability.

## Setup checklist

1. Create a new Notion database named `WebAppV1 — Questions`.
2. Add every property listed above with the exact name and type.
3. Share the DB with the existing `WebAppV1 Sync` integration (or a dedicated
   one named `WebAppV1 Questions`).
4. Copy the database ID from the URL (32 hex chars before `?v=`).
5. Add to GitHub repo secrets:
   - `NOTION_QUESTIONS_DATABASE_ID` (the new ID, distinct from `NOTION_DATABASE_ID`).
6. Add to your local `.env.local` for testing:
   ```
   NOTION_TOKEN=secret_...
   NOTION_QUESTIONS_DATABASE_ID=...
   ```
7. Run the bridge script with `--dry-run` first.

## Why a separate DB from the existing Tasks DB?

- Different lifetime: Tasks live as long as a feature; Questions are short-lived (hours/days).
- Different writers: Tasks are written by `notion-sync.yml` (GitHub → Notion only). Questions need Yume to write the `Answer` field — a separate DB avoids accidental writes leaking into the Tasks DB.
- Different schemas: a unified DB would force optional fields everywhere and confuse mobile filtering.
