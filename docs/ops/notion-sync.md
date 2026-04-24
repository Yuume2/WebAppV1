# GitHub → Notion sync (ops)

One-way sync from the WebAppV1 GitHub repo to a Notion Tasks database.
Free, runs on GitHub Actions, no third-party paid integration.

GitHub stays the source of truth. Notion is a read-only cockpit.

## Files

- `.github/workflows/notion-sync.yml` — hourly schedule + manual dispatch.
- `scripts/notion/sync-github-to-notion.mjs` — Node 20 script, no npm deps.
- `scripts/notion/README.md` — script reference + required Notion schema.
- `scripts/notion/.env.local.example` — local env placeholders.

## Manual setup (one-time)

### 1. Create the Notion integration

1. Go to <https://www.notion.so/my-integrations>.
2. Click **New integration**. Name it e.g. `WebAppV1 Sync`.
3. Type: **Internal**. Associated workspace: your workspace.
4. Capabilities: Read content, Update content, Insert content. No user info.
5. Save. Copy the **Internal Integration Secret** — this is `NOTION_TOKEN`.

### 2. Prepare the Notion database

In Notion, open the **Tasks** database. Confirm it has the properties listed in
`scripts/notion/README.md` (Title, Type, Status, Assignee, URL, Repo, Number,
Updated At, Labels, State, Draft, GitHub ID). Create any missing ones with the
exact names and types.

### 3. Share the database with the integration

1. Open the Tasks database as a full page.
2. Top-right `•••` → **Connections** → **Connect to** → select `WebAppV1 Sync`.
3. Confirm.

### 4. Copy the Database ID

Database URL looks like:

```
https://www.notion.so/<workspace>/<db-name>-<32-hex-chars>?v=...
```

The 32 hex chars at the end of the path (before `?v=`) are the Database ID.
This is `NOTION_DATABASE_ID`.

### 5. Add GitHub secrets

On GitHub: repo → **Settings** → **Secrets and variables** → **Actions** →
**New repository secret**:

| Name                 | Value                               |
|----------------------|-------------------------------------|
| `NOTION_TOKEN`       | the integration secret from step 1  |
| `NOTION_DATABASE_ID` | the 32-char id from step 4          |

`GITHUB_TOKEN` is provided automatically — do not add it.

### 6. Trigger the first run

On GitHub: **Actions** → **notion-sync** → **Run workflow**. Optionally set
`dry_run` = `true` for the first run to preview without writes.

After it finishes green, open the Notion Tasks database: issues and PRs
should be present.

## Local run (optional)

```bash
cp scripts/notion/.env.local.example scripts/notion/.env.local
# edit scripts/notion/.env.local with real values
set -a && source scripts/notion/.env.local && set +a
DRY_RUN=1 node scripts/notion/sync-github-to-notion.mjs
```

`.env.local` is gitignored. Never commit it.

## Schedule

Hourly at `:17`. Adjust the `cron` line in
`.github/workflows/notion-sync.yml`. Remember cron in GitHub Actions is UTC.

## Troubleshooting

- **`Notion 401`**: the integration isn't shared with the database, or the
  token is wrong. Redo step 3.
- **`Notion 400 ... property ... does not exist`**: the database is missing
  one of the required properties. Redo step 2.
- **`Notion 400 ... Invalid request`** on select values: a label name contains
  a comma. The script strips commas but if you see this on another field,
  adjust the mapping.
- **GitHub rate limit**: the Action uses the built-in `GITHUB_TOKEN` which has
  a large per-repo quota. Unlikely to hit for a single repo.

## Security

- No token in the repo. Ever.
- `NOTION_TOKEN` and `NOTION_DATABASE_ID` live only in GitHub Secrets (Actions)
  or `.env.local` (local run). `.gitignore` covers `.env.local`.
- The script never logs token values.
- The workflow requests minimum permissions: `contents: read`, `issues: read`,
  `pull-requests: read`.
