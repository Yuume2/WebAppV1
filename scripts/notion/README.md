# scripts/notion

Local-run tooling for the GitHub → Notion Tasks sync.

- `sync-github-to-notion.mjs` — upserts GitHub issues + PRs into a Notion database.
- `.env.local.example` — placeholders only. Copy to `.env.local` (gitignored) for local runs.

## How the sync works

1. Fetches all issues and PRs from `$GITHUB_REPOSITORY` via the GitHub REST API.
2. For each item, builds a stable key `owner/repo#Issue-<n>` or `owner/repo#PR-<n>`.
3. Queries the Notion database for a page whose `GitHub ID` equals that key.
4. If found: PATCH the page. If not: create a new page.

GitHub is the source of truth. Notion properties are overwritten on each run.

## Required Notion database schema

The target Notion database must have these properties (names + types exact):

| Property     | Type         | Notes                                      |
|--------------|--------------|--------------------------------------------|
| Title        | Title        | The default title column.                  |
| Type         | Select       | Values: `Issue`, `PR`.                     |
| Status       | Select       | Values: `Open`, `Closed`, `Draft`, `Merged`. |
| Assignee     | Text         | Comma-separated GitHub logins.             |
| URL          | URL          |                                            |
| Repo         | Text         | e.g. `Yuume2/WebAppV1`.                    |
| Number       | Number       |                                            |
| Updated At   | Date         |                                            |
| Labels       | Multi-select | Labels are auto-added on first sync.       |
| State        | Select       | Values: `open`, `closed`.                  |
| Draft        | Checkbox     | True only for draft PRs.                   |
| GitHub ID    | Text         | Dedupe key. Do not edit manually.          |

Select/multi-select options are created on the fly by Notion when the script
sends a new value.

## Local run

Requires Node 20+.

```bash
cp scripts/notion/.env.local.example scripts/notion/.env.local
# edit scripts/notion/.env.local with your real values

set -a && source scripts/notion/.env.local && set +a
DRY_RUN=1 node scripts/notion/sync-github-to-notion.mjs   # preview
node scripts/notion/sync-github-to-notion.mjs             # real run
```

## CI run

`.github/workflows/notion-sync.yml` runs hourly and on manual dispatch.
Requires these repo secrets: `NOTION_TOKEN`, `NOTION_DATABASE_ID`.
`GITHUB_TOKEN` is provided automatically by Actions.

See `docs/ops/notion-sync.md` for the full setup walkthrough.
