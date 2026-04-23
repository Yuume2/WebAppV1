# Charte de coordination WebAppV1

> Source de vérité unique pour la collaboration X / E / L sur la Phase 2.
> Prime sur toute convention orale ou tout autre document du repo.
> Mise à jour par X uniquement.

---

## 1. Contexte

WebAppV1 est un monorepo pnpm / Turborepo construisant une web app "AI Workspace"
(Next.js 15 + React 19 côté web, Node.js côté api, packages partagés dont `@webapp/types`).

La Phase 2 couvre : persistance (SQLite + Prisma) → auth (email + password, sessions cookie)
→ stockage sécurisé des clés providers (AES-256-GCM) → premier provider réel (OpenAI, streaming SSE).

Trois sessions Claude travaillent en parallèle :
- **X** — technical lead, intégrateur
- **L** — backend
- **E** — frontend

---

## 2. Rôles et scopes exclusifs

### X — Technical lead / intégrateur

**Scope exclusif (personne d'autre ne touche ces chemins) :**
- `packages/types/**` — source de vérité des contrats partagés
- `packages/config/**` — config partagée
- `packages/ui/**` (schéma et primitives ; E consomme)
- `prisma/**` — schéma DB, migrations
- `turbo.json`, `tsconfig.base.json`, `.github/workflows/**`
- `CLAUDE.md`, `project-memory/**`, `docs/adr/**`, `STATUS.md`
- `CONTRIBUTING.md`

**Responsabilités :**
- Écrit les PRs de contrats qui débloquent E et L
- Seul à pouvoir merger sur `main`
- Maintient `STATUS.md` en fin de chaque vague
- Rédige les ADRs
- Produit du code réel sur son scope (pas uniquement de la doc)

### L — Backend engineer

**Scope exclusif :**
- `apps/api/**`

**Responsabilités :**
- Persistance, auth, providers, endpoints d'écriture
- Travaille toujours contre des contrats `@webapp/types` déjà mergés sur `main`
- Propose des changements de types via issue ou commentaire de PR à X
- Ne modifie jamais directement `packages/types`
- Tests backend : repositories, auth, provider layer mocké

### E — Frontend engineer

**Scope exclusif :**
- `apps/web/**`

**Scope partagé en lecture seule :**
- `packages/ui/**` (consomme, ne modifie pas le schéma)
- `packages/types/**` (consomme, ne modifie jamais)

**Responsabilités :**
- Auth UX, flows d'écriture, streaming chat UI
- Tue progressivement la frontière mock/fallback
- Maintient `apps/web/src/lib/api/` comme unique point d'entrée `fetch` vers l'API

---

## 3. Règles de collision (non négociables)

1. **Un owner par chemin.** Toute PR touchant un chemin hors scope de l'owner nécessite review X explicite + note de coordination dans la PR.
2. **Les contrats landent en premier.** E et L ne démarrent jamais une feature dont le contrat `@webapp/types` n'est pas sur `main`.
3. **Nommage des branches :** `x/<topic>`, `l/<topic>`, `e/<topic>`.
4. **Pas d'écritures parallèles sur `@webapp/types`.** Jamais. Seulement X.
5. **Pas d'imports cross-app.** `apps/web` ne peut jamais importer depuis `apps/api` et vice versa. Check CI automatique.
6. **Pas de redéfinition de types partagés localement.** Si un type traverse la frontière web/api, il vit dans `@webapp/types`.
7. **Pas de merge sur `main` sauf par X.**
8. **Pas de TODO laissé en `main`.** Un TODO = une issue GitHub ouverte.

---

## 4. Contrats sacrés

Fichiers que seul X modifie :

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

## 5. Workflow standard d'une feature

1. X land le contrat (`@webapp/types` + interfaces repository + shape d'erreur).
2. X publie un brief court dans `project-memory/briefs/<vague>-<feature>.md`.
3. L et E travaillent en parallèle, chacun sur sa branche, aucun fichier commun.
4. Chacun ouvre sa PR. CI tourne.
5. X review, demande des changements, merge.
6. X met à jour `STATUS.md`.

---

## 6. Cadence

- **En cours de vague** : pas de synchro formelle. E et L bossent en autonomie contre les contrats figés.
- **Fin de vague** : X met à jour `STATUS.md`, produit le brief de la vague suivante, liste ce qui est mergé et ce qui a bougé.
- **Début de session** de E ou L : lecture obligatoire de `STATUS.md` et des briefs actifs.

---

## 7. Format PR

**Titre :** `[<owner>] <vague> — <action courte>`

Exemples :
- `[X] W1 — Schéma Prisma + contrats @webapp/types pour persistance`
- `[L] W1 — Migration des endpoints read vers Prisma`
- `[E] W1 — Client API typé centralisé`

**Corps minimum :**
- **But** : 1-2 phrases
- **Scope** : liste des chemins modifiés
- **Contrats utilisés** : version de `@webapp/types` si relevant
- **Tests** : ce qui est ajouté / modifié
- **Critères de sortie** : coche les items du brief de la vague

---

## 8. Décisions actées (référence rapide)

| Sujet | Décision | ADR |
|---|---|---|
| DB | SQLite + Prisma, schéma Postgres-compatible | ADR-0001 |
| Auth | email + password (argon2id), sessions server-side cookie httpOnly | ADR-0002 |
| Secrets | AES-256-GCM, `MASTER_ENCRYPTION_KEY` depuis env | ADR-0003 |
| Streaming | SSE, `ChatStreamEvent` normalisé multi-provider | ADR-0004 |
| Erreurs | Enveloppe `{ok: true, data}` / `{ok: false, error}` | ADR-0005 |
| Providers | Abstraction `ProviderAdapter`, OpenAI d'abord | ADR-0006 |
| Validation | Zod partout, schémas dans `@webapp/types` | — |
| API style | REST classique + types partagés | — |
| Logging | pino | — |
| Soft-delete | `deletedAt` nullable partout | — |
| Branches | Trunk-based, PR vers `main` | — |
| Multi-user | Oui dès Phase 2 | — |
| Collaboration | Pas pour Phase 2 | — |
| Mobile | Desktop-first, mobile en Phase 3 | — |
