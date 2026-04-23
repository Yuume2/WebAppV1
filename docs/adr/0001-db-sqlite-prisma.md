# ADR-0001 — Base de données : SQLite + Prisma

**Statut :** Accepté
**Date :** 2026-04-23
**Auteur :** X

---

## Contexte

WebAppV1 est actuellement un MVP local avec données in-memory seedées. La Phase 2
requiert une persistance durable pour supporter multi-user, auth, credentials
chiffrés et historique de messages.

Contraintes :

- Local-first immédiat, mais déployable plus tard sans rewrite
- Un seul développeur principal + 3 sessions Claude parallèles
- Pas de coût infra prématuré (pas de Docker obligatoire en local)
- Typage fort bout-en-bout avec `@webapp/types`
- Schéma évolutif (auth, credentials, attachments ajoutés par vagues successives)

---

## Décision

**SQLite comme moteur, Prisma comme ORM.**

Le schéma est écrit de manière Postgres-compatible (pas de types propriétaires
SQLite, pas de `rowid` exploité, clés UUID en string). Le passage à Postgres se
fera par changement de `datasource` dans `prisma/schema.prisma` + regénération
du client, sans réécriture du code applicatif.

Fichier DB local : `apps/api/prisma/dev.db` (gitignoré).
Migrations versionnées dans `prisma/migrations/`.

Scripts exposés à la racine :

- `pnpm db:generate` — régénère le client Prisma
- `pnpm db:migrate` — applique les migrations en dev
- `pnpm db:seed` — seed de données dev
- `pnpm db:studio` — ouvre Prisma Studio

---

## Conséquences

**Positives :**

- Zéro setup pour démarrer (`pnpm dev` suffit)
- Migrations typées, client typé
- Studio UI gratuite pour inspecter la DB
- Schéma unique pour SQLite et Postgres

**Négatives :**

- SQLite ne supporte pas les writes concurrents à gros volume — non bloquant en local
- Quelques types Prisma (ex. `Json`) se comportent différemment selon le moteur — documenté
- Prisma ajoute une dépendance lourde — acceptable vu le gain de productivité

**Impact code :**

- Tous les repositories (`apps/api/src/repositories/**`) sont typés via le client Prisma
- `packages/types` expose les entités publiques (sans champs sensibles comme `passwordHash` ou `encryptedKey`)
- L'instanciation du client Prisma se fait dans `apps/api/src/db/client.ts` (singleton)

---

## Alternatives rejetées

- **Postgres + Docker en local :** surcoût de setup sans gain pour la phase actuelle. Reporté à la phase déploiement.
- **SQLite + Drizzle :** plus léger et plus SQL-natif, mais moins de guardrails pour un setup multi-agents. Prisma rend les dérives plus difficiles.
- **better-sqlite3 brut sans ORM :** trop de surface où L peut dévier sur les conventions. Rejeté.
- **Pas de persistance (garder in-memory) :** bloque la Phase 2 entière. Rejeté.
