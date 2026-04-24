# issues.delta.json — schema

Agent-generated follow-ups after executing a GitHub issue. Consumed by `tools/apply-issue-delta.mjs`.

## Top-level

| Field | Type | Required | Notes |
|---|---|---|---|
| `generatedAt` | ISO date | yes | |
| `agent` | string | yes | model id |
| `project.projectOwnerLogin` | string | yes | must match `issues.json` |
| `project.projectNumber` | number | yes | must match `issues.json` |
| `context.sourceIssue` | number | yes | the issue the agent just executed |
| `context.sourcePr` | number \| null | yes | PR opened for that issue, if any |
| `context.sourceBranch` | string \| null | yes | |
| `context.summary` | string | yes | one paragraph, why these follow-ups exist |
| `issues` | array | yes | 1–5 items. More than 5 is rejected. |

## Each issue

| Field | Type | Required | Notes |
|---|---|---|---|
| `externalKey` | string | yes | stable agent-assigned key; dedupes across runs |
| `title` | string | yes | must be unique repo-wide |
| `body` | markdown | yes | Goal / AC / Out-of-scope blocks |
| `labels` | string[] | yes | each must already exist in the repo |
| `owner` | `L`\|`E`\|`X` | yes | maps to Project Owner field |
| `area` | `api`\|`web`\|`ci`\|`memory`\|`packages-types` | yes | maps to Project Area field |
| `priority` | `P0-now`\|`P1-week`\|`P2-soon`\|`P3-backlog` | yes | maps to Project Priority field |
| `status` | `Backlog`\|`Ready` | yes | agents may only set these two |
| `sourceIssue` | number | yes | same as context.sourceIssue unless cross-linking |
| `reason` | string | yes | why this can't be inlined in the parent issue |
| `dependsOn` | number[] | no | other issue numbers |

## Guardrails enforced by `apply-issue-delta.mjs`

- `issues.length` must be between 1 and 5. Reject otherwise.
- Every label must exist on the GitHub repo (fetched at run time).
- Every `owner`/`area`/`priority`/`status` must map to an existing Project single-select option.
- Duplicate detection runs on `title` AND `externalKey` — either match blocks creation.
- No issue is created without `--yes`.
- Project fields are applied right after creation; a creation without Project add is considered a failure.

## Auto-apply policy (enforced by the agent, not the script)

The script itself is neutral: it will apply any delta passed with `--yes`. The **agent** running `AI-ISSUE-EXECUTION-PROTOCOL.md` decides whether to pass `--yes`, based on this deterministic rule:

- **AUTO-APPLY** allowed iff every follow-up in the delta satisfies all of:
  - has label `risk:safe`
  - has label `ai:autonomous`
  - does **not** have `risk:review-required`
  - does **not** have `risk:destructive`
  - does **not** have `ai:human-checkpoint`
- **HOLD** (wait for human OK) if **any** follow-up fails the above.
- A single disqualifying follow-up disqualifies the whole delta; do not split.
- `risk:destructive` is **never** auto-applied, even alone, even if also `ai:autonomous`.

After applying, the agent must report each created follow-up with its issue number and URL.
