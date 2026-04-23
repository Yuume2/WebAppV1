# Brief W1 — E (Frontend) — Client API typé & refactor data layer

> À lire intégralement avant de coder.
> Précédé par : [STATUS.md](../../STATUS.md), [CHARTE.md](../CHARTE.md), ADRs 0001-0006.

---

## Ton rôle

Tu es **E**, frontend engineer sur WebAppV1.

**Ton scope exclusif :** `apps/web/**`.

**Lecture seule :** `packages/types/**`, `packages/ui/**`.

**Tu ne modifies jamais :** `apps/api/**`, `packages/types/**`, `prisma/**`,
et tout autre chemin hors `apps/web/**`.

---

## Contexte

La Vague 1 introduit la persistance DB côté backend. Les endpoints read
conservent **exactement le même shape de réponse** qu'avant — côté frontend,
rien ne devrait casser visuellement.

Mais on profite de cette vague pour **nettoyer la couche data frontend** :

1. Centraliser tous les `fetch` vers l'API dans un client typé unique
2. Consommer les types depuis `@webapp/types` (source de vérité)
3. Commencer à retirer les mock/fallback là où la donnée réelle est fiable

C'est une vague de dette technique réduite + préparation des W2 et W3 où le
frontend va massivement écrire et streamer.

---

## Prérequis à vérifier avant de démarrer

1. `git checkout main && git pull`
2. `pnpm install`
3. Vérifier que `@webapp/types` exporte bien les types que tu vas consommer :
   `Project`, `Workspace`, `Window`, `Message`, `ApiResponse`, `ApiError`
4. Vérifier que le backend tourne en local avec Prisma : `pnpm dev` → ouvre
   le frontend et vérifie que la donnée affichée vient bien de la DB (pas du
   seed in-memory)

Si un item manque, **arrête et remonte à X**.

---

## Ton travail

### 1. Créer le client API typé unique

**Chemin :** `apps/web/src/lib/api/client.ts`

Ce fichier devient **le seul endroit** où `fetch` vers le backend se fait.
Tout composant, tout hook, toute server component qui veut parler au backend
passe par ce client.

Il doit :

- Exposer des fonctions typées par endpoint (ex. `api.projects.list()`)
- Déballer automatiquement l'enveloppe `{ok, data}` d'ADR-0005
- Throw une `ApiError` typée si `ok: false`
- Supporter le `credentials: 'include'` (pour W2 avec les cookies)
- Gérer un préfixe `API_BASE_URL` configurable via env

Squelette attendu :

```ts
// apps/web/src/lib/api/client.ts
import type {
  ApiResponse, Project, Workspace, Window, Message,
} from '@webapp/types';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const json = (await res.json()) as ApiResponse<T>;
  if (!json.ok) {
    throw new ApiError(json.error.code, json.error.message, json.error.details, res.status);
  }
  return json.data;
}

export const api = {
  projects: {
    list: () => request<Project[]>('/projects'),
    get: (id: string) => request<Project>(`/projects/${id}`),
    workspaces: (id: string) => request<Workspace[]>(`/projects/${id}/workspaces`),
  },
  workspaces: {
    windows: (id: string) => request<Window[]>(`/workspaces/${id}/windows`),
  },
  windows: {
    messages: (id: string) => request<Message[]>(`/windows/${id}/messages`),
  },
};
```

### 2. Refactor toutes les pages et composants pour utiliser ce client

Cherche tous les `fetch(` et tous les appels directs à un fichier de mock /
seed dans `apps/web/**`. Remplace-les par un appel via `api.*`.

Règles :

- Aucun `fetch` direct en dehors de `apps/web/src/lib/api/client.ts`
- Aucun import de mock en dehors du module de fallback (voir point 3)
- Les erreurs `ApiError` sont attrapées au bon niveau (page ou composant boundary)
  et affichées avec un message lisible

### 3. Gérer proprement les mock/fallback

La frontière mock/fallback actuelle existe pour le dev quand l'API n'est pas
disponible. Ne la supprime pas d'un coup en W1 — ça casserait les scénarios
où L travaille sur le backend et toi sur l'UI.

À la place :

- Isole tous les mocks dans `apps/web/src/lib/api/mocks/`
- Introduis un flag `NEXT_PUBLIC_USE_MOCKS=true` dans `.env.local`
- Dans `client.ts`, si le flag est à `true`, le client renvoie les mocks au
  lieu d'appeler le backend — toujours avec le même shape typé
- Les "source badges" deviennent dynamiques : affiche `'mock'` ou `'live'`
  selon la source de la donnée, pour que tu saches visuellement d'où ça vient

**Objectif W2/W3 :** retirer totalement ce flag. En W1 on le garde comme filet
de sécurité pendant la transition.

### 4. Typage strict

- Aucun `any` dans la data layer
- Aucun type local qui duplique un type de `@webapp/types` — importe-le
- Si tu as besoin d'un type dérivé (ex. `ProjectWithWorkspaces`), définis-le
  localement **à partir** du type partagé : `type ProjectWithWorkspaces = Project & { workspaces: Workspace[] }`

### 5. Tests

Pour ce refactor, ajoute :

- Un test unitaire du `client.ts` avec un `fetch` mocké qui vérifie :
  - Déballage correct de `{ok: true, data}`
  - Throw d'`ApiError` sur `{ok: false, error}`
- Un test de composant par page principale qui vérifie le rendu avec des
  données fixtures (pas d'appel réseau réel)

Objectif : pas de couverture chiffrée. Le client API doit être solidement
testé car tout le frontend en dépend.

---

## Ce que tu NE fais PAS en W1

- **Pas d'auth UI.** Pas de pages `/login`, `/signup`. Ça arrive en W2.
- **Pas de flows d'écriture** (créer project, envoyer message). Ça arrive en W2.
- **Pas de chat streaming.** Ça arrive en W3.
- **Pas de gestion des credentials.** Ça arrive en W3.
- **Pas de modification de `packages/ui`.** Si tu penses qu'un composant UI
  manque, ouvre une issue. X tranche.
- **Pas de modification de `packages/types`.** Même règle.

---

## Critères de sortie (ta PR doit cocher tout ça)

- [ ] `apps/web/src/lib/api/client.ts` existe et est l'unique point d'entrée `fetch`
- [ ] Aucun `fetch(` dans `apps/web/**` en dehors de `lib/api/`
- [ ] Toutes les pages et composants utilisent `api.*`
- [ ] Mocks isolés dans `apps/web/src/lib/api/mocks/` avec flag `NEXT_PUBLIC_USE_MOCKS`
- [ ] Source badges dynamiques (mock / live)
- [ ] Tests `client.ts` + tests de composants verts
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` verts
- [ ] `pnpm dev` fonctionne, données lues depuis la DB, aucune régression visuelle
- [ ] Aucun import cross-app vers `apps/api`
- [ ] Aucun type dupliqué localement qui existe dans `@webapp/types`

---

## Format de ta PR

**Titre :** `[E] W1 — Client API typé centralisé + refactor data layer`

**Branche :** `e/w1-api-client`

**Corps :** suit le format défini dans `project-memory/CHARTE.md` §7.

---

## Si tu es bloqué

- Un type manque dans `@webapp/types` → ouvre un commentaire sur ta PR et tag X. Ne redéfinis pas.
- Le shape de réponse d'un endpoint a changé → ça ne doit PAS arriver en W1 (le shape est conservé). Si ça arrive, remonte à X : c'est un bug L.
- Un comportement UI ambigu → propose ta version dans la PR.

Ne push jamais sur `main`. Ne merge jamais toi-même.
