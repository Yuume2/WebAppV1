# Backlog source of truth

`issues.json` drives `tools/create-github-issues.mjs`.

## Fields per issue

- `title` — unique; duplicate-detection key (used to skip existing issues).
- `body` — markdown rendered into the GitHub issue.
- `labels` — applied verbatim. Seed them first via `tools/seed-labels.sh` (see coord backlog).
- `owner` — `L` | `E` | `X`. Maps to the GitHub Project custom field `Owner`.
- `area` — `api` | `web` | `ci` | `memory` | `packages-types`. Maps to project field `Area`.
- `priority` — `P0-now` | `P1-week` | `P2-soon` | `P3-backlog`. Mirrored in labels.
- `status` — `Backlog` | `Ready`. Maps to project field `Status`.

## Project mapping

Set `project.projectNumber` and `project.projectOwnerLogin` at the top of `issues.json`
to enable auto-add to the GitHub Project (`gh project item-add`). Leaving them `null`
disables the Project step — issues are still created and labeled.

Custom fields (`Owner`, `Area`, `Status`) are NOT auto-filled by the script yet —
`gh project item-edit` requires the field IDs and option IDs, which need one manual lookup.
See the final report from `create-github-issues.mjs` for the copy-pastable commands.

## Commands

```bash
pnpm issues:dry-run     # preview
pnpm issues:create      # actually create (after explicit OK)
```
