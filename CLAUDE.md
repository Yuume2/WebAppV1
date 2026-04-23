# CLAUDE.md — Règles agents WebAppV1

> Ce fichier cadre le travail de toute session Claude opérant sur ce repo.
> Il est maintenu par X uniquement.
> La source de vérité détaillée vit dans [`project-memory/CHARTE.md`](project-memory/CHARTE.md).

---

## Avant toute action

1. Lire [`STATUS.md`](STATUS.md) à la racine.
2. Lire les briefs actifs dans [`project-memory/briefs/`](project-memory/briefs/).
3. Identifier ton rôle (X, L, ou E) et vérifier que tu travailles dans ton scope.

---

## Rôles

### X — Technical lead / intégrateur

**Scope exclusif :**
- `packages/types/**`, `packages/config/**`, `packages/ui/**` (schéma)
- `prisma/**`, `turbo.json`, `tsconfig.base.json`
- `.github/workflows/**`
- `CLAUDE.md`, `project-memory/**`, `docs/adr/**`, `STATUS.md`, `CONTRIBUTING.md`

**Tâches :**
- Écrit les contrats partagés (`@webapp/types`)
- Rédige les ADRs
- Seul à merger sur `main`
- Maintient `STATUS.md`
- Produit aussi du code réel (pas uniquement de la doc)

### L — Backend

**Scope exclusif :** `apps/api/**`

**Tâches :**
- Persistance, auth, providers, endpoints d'écriture
- Toujours contre des contrats `@webapp/types` déjà sur `main`
- Ne modifie jamais `packages/types` directement
- Tests backend

### E — Frontend

**Scope exclusif :** `apps/web/**`
**Lecture seule :** `packages/ui/**`, `packages/types/**`

**Tâches :**
- Auth UX, flows d'écriture, streaming chat UI
- Consomme `packages/types`, ne redéfinit jamais de types partagés
- Client API typé unique : `apps/web/src/lib/api/`

---

## Règles non négociables

1. **Un owner par chemin.** Hors scope = review X obligatoire.
2. **Contrats avant features.** E et L attendent que `@webapp/types` soit mergé.
3. **Branches :** `x/<topic>`, `l/<topic>`, `e/<topic>`.
4. **`@webapp/types` = X seul.**
5. **Aucun import cross-app.** `apps/web` ↛ `apps/api` et inverse. Vérifié par CI.
6. **Pas de type partagé dupliqué localement.**
7. **Merge sur `main` = X seul.**
8. **TODO = issue GitHub ouverte.**

---

## Fichiers sacrés (X seul modifie)

```
packages/types/**
packages/config/**
prisma/schema.prisma
prisma/migrations/**
turbo.json
tsconfig.base.json
.github/workflows/**
CLAUDE.md
project-memory/**
docs/adr/**
STATUS.md
```

---

## Format PR

**Titre :** `[<owner>] <vague> — <action courte>`
Exemple : `[L] W1 — Migration des endpoints read vers Prisma`

**Corps :** but, scope, contrats utilisés, tests, critères de sortie cochés.

---

## Décisions tranchées (Phase 2)

| Sujet | Décision | ADR |
|---|---|---|
| DB | SQLite + Prisma | ADR-0001 |
| Auth | email + password argon2id, sessions cookie httpOnly | ADR-0002 |
| Secrets | AES-256-GCM, `MASTER_ENCRYPTION_KEY` env | ADR-0003 |
| Streaming | SSE normalisé multi-provider | ADR-0004 |
| Erreurs | `{ok, data}` / `{ok, error}` | ADR-0005 |
| Providers | `ProviderAdapter`, OpenAI d'abord | ADR-0006 |

Validation : Zod. Logging : pino. API : REST. Soft-delete partout. Branches trunk-based. Multi-user dès maintenant.

---

## Références

- Charte complète : [`project-memory/CHARTE.md`](project-memory/CHARTE.md)
- Plan Phase 2 : [`project-memory/PLAN-PHASE-2.md`](project-memory/PLAN-PHASE-2.md)
- ADRs : [`docs/adr/`](docs/adr/)
- Getting started : [`README.md`](README.md)
