# Contributing

Workflow rules for the 2-dev parallel setup on `WebAppV1`.

## Golden rules

- **Never push directly to `main`.** All work lands via pull request.
- **Always `git pull --rebase` before you push.** Prevents accidental merge commits.
- One feature or fix per branch. One branch per PR. One PR per review.
- Keep `main` green: if CI fails, fix before merging anything else.

## Branch naming

```
<type>/<short-kebab-description>
```

Types:

- `feat/` — new feature
- `fix/` — bug fix
- `chore/` — tooling, config, infra
- `docs/` — documentation only
- `refactor/` — internal code change, no behavior change

Examples: `feat/chat-window`, `fix/api-port-env`, `chore/add-eslint`.

## Commit messages

Conventional Commits, lowercase, imperative, no trailing period.

```
<type>(<scope>): <subject>
```

Scopes match the workspace: `web`, `api`, `ui`, `types`, `config`, `root`, `ci`, `docs`.

Examples:

- `feat(web): add workspace canvas shell`
- `fix(api): default API_PORT to 4000`
- `chore(root): add prettier format script`

## Pull requests

- Target `main`.
- Title follows the commit message format.
- Description lists: what, why, how to test.
- Rebase on `main` before merge. Prefer **squash merge** for a linear history.
- At least one approval required.
- CI (`typecheck`, `lint`) must pass.

## Local workflow

```bash
git checkout main
git pull --rebase
git checkout -b feat/my-thing

# work, commit often...

git pull --rebase origin main   # before pushing
git push -u origin feat/my-thing
```

## Code conventions

- TypeScript strict everywhere — no `any` unless justified in a comment.
- File naming: `kebab-case.ts` for modules, `PascalCase.tsx` for React components.
- Import shared types from `@webapp/types`, shared config from `@webapp/config`, shared UI from `@webapp/ui`.
- Keep business logic out of `apps/web` components when it can live in `@webapp/*` packages.

## Dev commands

```bash
pnpm install         # install all workspaces
pnpm dev             # run web + api in parallel (turbo)
pnpm typecheck       # type-check everything
pnpm lint            # lint everything
pnpm format          # prettier write
pnpm build           # build all
```

## Dividing work across 2 devs

To avoid merge friction, split by surface area:

- Dev A: `apps/web` + `packages/ui`
- Dev B: `apps/api` + `packages/types` + `packages/config`

Shared changes (types, config) → coordinate on Slack / commit message before pushing.
