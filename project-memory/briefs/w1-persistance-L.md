# Brief W1 — L (Backend) — Fondation persistance

> À lire intégralement avant de coder.
> Précédé par : [STATUS.md](../../STATUS.md), [CHARTE.md](../CHARTE.md), ADRs 0001-0006.

---

## Ton rôle

Tu es **L**, backend engineer sur WebAppV1.

**Ton scope exclusif :** `apps/api/**`.

**Tu ne modifies jamais :** `packages/types/**`, `prisma/schema.prisma`,
`prisma/migrations/**`, `apps/web/**`, et tout autre chemin hors `apps/api/**`.

---

## Contexte

La Phase 2 remplace le seed in-memory par une DB réelle. X a déjà land :

- Le schéma Prisma (`prisma/schema.prisma`) avec les entités `User`, `Project`,
  `Workspace`, `Window`, `Message`, `MessageAttachment`, `ProviderCredential`
- La première migration
- Les types publics exposés dans `packages/types` (sans champs sensibles)
- Les **interfaces** de repository dans `apps/api/src/repositories/*.interface.ts`

Tu dois maintenant **implémenter** ces interfaces contre Prisma, migrer les
endpoints read existants vers les repositories, et produire un seed de dev.

---

## Prérequis à vérifier avant de démarrer

Avant toute modification :

1. `git checkout main && git pull`
2. `pnpm install`
3. Vérifier que `prisma/schema.prisma` existe et contient les entités attendues
4. Vérifier que `packages/types` expose `User`, `Project`, `Workspace`,
   `Window`, `Message`, `MessageAttachment`, `ProviderCredentialPublic`
5. Vérifier que `apps/api/src/repositories/` contient les fichiers d'interface
6. Lancer `pnpm db:generate` et `pnpm db:migrate` pour avoir un client Prisma à jour

Si un de ces items manque, **arrête et remonte à X**. Ne commence pas.

---

## Ton travail

### 1. Implémenter les repositories

Dans `apps/api/src/repositories/`, pour chaque interface (`UserRepository`,
`ProjectRepository`, `WorkspaceRepository`, `WindowRepository`,
`MessageRepository`), crée une implémentation Prisma.

Conventions :

- Une classe par entité, nommée `<Entity>RepositoryPrisma`
- Constructeur prend un client Prisma en argument (pour faciliter le test)
- Respecte le soft-delete : ne retourne jamais une entité avec `deletedAt !== null`
  sauf si l'interface expose explicitement une méthode `includeDeleted`
- Scope **explicite par `userId`** quand la méthode reçoit un `userId` — aucune
  fuite cross-user possible

Exemple de structure :

```ts
// apps/api/src/repositories/project.repository.prisma.ts
import type { PrismaClient } from '@prisma/client';
import type { Project } from '@webapp/types';
import type { ProjectRepository } from './project.repository.interface';

export class ProjectRepositoryPrisma implements ProjectRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listByUser(userId: string): Promise<Project[]> {
    const rows = await this.prisma.project.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toPublicProject);
  }

  // ...
}

function toPublicProject(row: /* prisma type */): Project {
  // mapping explicite, jamais de spread direct pour éviter les fuites de champs
}
```

**Règle critique :** ne spread jamais un objet Prisma vers un type public.
Toujours mapper explicitement champ par champ. Les fuites de champs sensibles
(passwordHash, encryptedKey) sont des bugs de sécurité.

### 2. Singleton Prisma

Dans `apps/api/src/db/client.ts`, expose un singleton Prisma :

```ts
import { PrismaClient } from '@prisma/client';

declare global {
  var __prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}
```

Le singleton évite les connexions multiples en dev hot-reload.

### 3. Migrer les endpoints read vers les repositories

Endpoints concernés (tous aujourd'hui contre le seed in-memory) :

- `GET /projects`
- `GET /projects/:id`
- `GET /projects/:id/workspaces`
- `GET /workspaces/:id/windows`
- `GET /windows/:id/messages`
- Health endpoints : **ne pas toucher**, ils restent indépendants

Pour chaque endpoint :

- Remplace l'accès in-memory par un appel au repository correspondant
- Conserve exactement le même shape de réponse (enveloppe ADR-0005)
- Utilise Zod pour valider les path params et query strings
- En cas d'absence : renvoie `NOT_FOUND` via l'helper `fail()`

**Scope user :** en Vague 1, l'auth n'est pas encore là. Utilise un `userId`
stubbé `'dev-user-1'` dans un middleware temporaire
`apps/api/src/middleware/dev-user.ts`. Ce middleware sera remplacé par le vrai
middleware de session en W2. Documente cette dépendance dans le code avec un
commentaire `// TODO(W2): remplacer par sessionMiddleware`.

### 4. Script de seed

Dans `apps/api/prisma/seed.ts`, écris un seed qui reproduit **exactement** la
donnée actuellement dans le seed in-memory. Pareil contenu, même IDs si
possible, pour que le frontend ne détecte aucun changement.

Le seed doit :

- Créer un `User` avec `id: 'dev-user-1'`, email `dev@webappv1.local`,
  `passwordHash` correspondant au mot de passe `devpassword` (utilise argon2id
  pour garder la cohérence avec W2)
- Créer tous les Projects, Workspaces, Windows, Messages existants, scopés à ce user
- Être idempotent : tourner `pnpm db:seed` deux fois ne duplique rien

Scripts à ajouter dans `apps/api/package.json` :

```json
{
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

### 5. Tests

Ajoute / met à jour dans `apps/api/__tests__/` :

- Test unitaire par repository (en utilisant un Prisma mocké ou une DB SQLite
  in-memory via `:memory:`)
- Test d'intégration par endpoint qui vérifie :
  - Le shape de la réponse (enveloppe `{ok, data}`)
  - Le scoping user (un user ne voit pas les projets d'un autre — même si en
    W1 il n'y a qu'un user dev, écris le test pour qu'il soit prêt en W2)
  - Le cas `NOT_FOUND`

Objectif : pas de couverture chiffrée, mais chaque repository et chaque
endpoint doivent avoir au moins un test nominal et un test d'erreur.

---

## Ce que tu NE fais PAS en W1

- **Pas d'auth.** Ne crée pas de endpoint `/auth/*`. Ne touche pas aux sessions.
  Ça arrive en W2.
- **Pas d'endpoints d'écriture** (create / update / delete). Ça arrive en W2.
- **Pas d'appels providers.** Ça arrive en W3.
- **Pas de chiffrement des credentials.** La table existe dans le schéma mais
  aucun endpoint ne l'utilise en W1.
- **Pas de modification de `prisma/schema.prisma`.** Si tu penses qu'il manque
  un champ, ouvre une issue ou commente sur la PR de X. Tu ne touches pas.
- **Pas de modification de `packages/types`.** Même règle.

---

## Critères de sortie (ta PR doit cocher tout ça)

- [ ] Tous les repositories implémentés contre Prisma
- [ ] Singleton Prisma en place
- [ ] Tous les endpoints read migrés, même shape de réponse qu'avant
- [ ] Middleware `dev-user` temporaire en place (avec TODO(W2))
- [ ] Seed idempotent qui reproduit la donnée in-memory à l'identique
- [ ] Tests repositories + tests endpoints verts
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` verts à la racine
- [ ] `pnpm dev` démarre et les données survivent un restart
- [ ] Aucun import vers `apps/web`, aucun import vers l'ancien seed in-memory
- [ ] Aucun champ sensible exposé dans les réponses

---

## Format de ta PR

**Titre :** `[L] W1 — Implémentation repositories Prisma + migration endpoints read`

**Branche :** `l/w1-persistance`

**Corps :** suit le format défini dans `project-memory/CHARTE.md` §7.

---

## Si tu es bloqué

- Un contrat te manque dans `@webapp/types` → ouvre un commentaire sur ta PR et tag X. Ne redéfinis pas localement.
- Le schéma Prisma te semble incomplet → ouvre une issue. Ne modifie pas.
- Un choix d'implémentation te semble ambigu → propose dans la PR, X tranche à la review.

Ne push jamais sur `main`. Ne merge jamais toi-même.
