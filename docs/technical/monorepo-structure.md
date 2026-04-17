# Monorepo structure

```
WebAppV1/
├── apps/
│   ├── web/              # Next.js 15 App Router frontend
│   └── api/              # Node.js + TS backend
├── packages/
│   ├── ui/               # Shared React primitives
│   ├── config/           # Shared runtime config / env schema
│   └── types/            # Shared TS domain types
├── docs/
│   ├── product/          # vision, MVP scope
│   └── technical/        # architecture, structure
├── .github/workflows/    # CI
├── package.json          # root workspace scripts
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
└── .env.example
```

## Tooling

- **pnpm workspaces** — install, link, isolate deps per package
- **Turborepo** — task graph + caching for `build`, `dev`, `lint`, `typecheck`
- **TypeScript** — one `tsconfig.base.json`, each package extends

## Naming

- All internal packages scoped `@webapp/*`
- Apps: `@webapp/web`, `@webapp/api`
- Libs: `@webapp/ui`, `@webapp/config`, `@webapp/types`

## Common commands

```bash
pnpm install                      # install all
pnpm dev                          # run all dev tasks
pnpm --filter @webapp/web dev     # run single app
pnpm typecheck                    # typecheck all
pnpm build                        # build all
```
