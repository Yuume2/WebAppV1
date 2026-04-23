# Plan d'exécution Phase 2 — WebAppV1

> Maintenu par X. Mis à jour en fin de vague.

---

## Objectif Phase 2

Passer du MVP local read-only à une vraie fondation produit :
- persistance durable
- auth multi-user
- stockage sécurisé des clés providers
- premier appel provider réel (OpenAI streaming)

Durée cible : **4 à 6 semaines** de travail effectif en parallèle 3 agents.

---

## Structure

4 vagues séquentielles. Dans une vague, E et L travaillent en parallèle
contre des contrats figés par X.

```
W0 : Ground truth & guardrails    (X seul, ~2-3 jours)
W1 : Fondation persistance        (X puis E+L, ~1-1.5 semaine)
W2 : Auth & écriture              (X puis E+L, ~1.5-2 semaines)
W3 : Premier provider (OpenAI)    (X puis E+L, ~1.5-2 semaines)
```

---

## W0 — Ground truth & guardrails

**Exécutant :** X seul.

**Livrables :**
- Audit complet de l'existant (`AUDIT.md`)
- 6 ADRs actés (DB, auth, secrets, streaming, erreurs, provider abstraction)
- `CLAUDE.md` mis à jour avec la charte
- `STATUS.md` créé
- CI bloquante (`typecheck + lint + test + build` + check imports cross-app)
- Scripts dev propres
- Briefs W1 pour E et L

**Critères de sortie :**
- Tous les ADRs mergés
- CI verte et bloquante
- Briefs W1 publiés dans `project-memory/briefs/`

**PRs (voir section finale) :** X-W0-01 à X-W0-06.

---

## W1 — Fondation persistance

**Prérequis :** W0 mergée.

### X en premier

- `prisma/schema.prisma` : `User`, `Project`, `Workspace`, `Window`, `Message`, `MessageAttachment`, `ProviderCredential`
- Première migration
- Scripts `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm db:studio`
- `packages/types` : entités publiques (sans champs sensibles), DTOs des endpoints existants
- Interfaces repository dans `apps/api/src/repositories/*.interface.ts`

### L en parallèle

- Implémente repositories Prisma
- Migre endpoints read vers repositories
- Seed de dev équivalent à l'ancien in-memory
- Tests repositories + endpoints

### E en parallèle

- `apps/web/src/lib/api/client.ts` — client fetch typé unique
- Refactor pages pour utiliser ce client
- Commence à retirer les mock fallbacks fiables

### Critères de sortie

- `pnpm dev` end-to-end, données persistent après restart
- Aucune régression UI
- Aucun import de seed in-memory
- Tests verts

---

## W2 — Auth & fondation écriture

**Prérequis :** W1 mergée.

### X en premier

- Contrats auth dans `@webapp/types` : `AuthUser`, `Session`, `SignupRequest`, `LoginRequest`, `AuthError`
- Enveloppe erreurs `{ok, data}` / `{ok, error}` formalisée (voir ADR-0005)
- Contrats write pour `Project`, `Workspace`, `Window`, `Message`
- Ajout `userId` sur entités scopées + migration

### L en parallèle

- Middleware session cookie httpOnly
- Endpoints `/auth/signup`, `/auth/login`, `/auth/logout`, `/auth/me`
- Hash argon2id
- Scoping `userId` sur tous les reads
- Endpoints write (create/update/softDelete)
- Rate limiting basique
- Tests auth + scoping

### E en parallèle

- Pages `/signup`, `/login`, `/logout`
- Session bootstrap (fetch `/auth/me`)
- Route protection
- Flows write : créer project / workspace / window / message (stub)
- Optimistic UI sur writes

### Critères de sortie

- Signup → login → hiérarchie complète → logout fonctionne
- Zéro endpoint accessible sans session
- Scoping correct vérifié
- Tests verts

---

## W3 — Premier provider réel (OpenAI)

**Prérequis :** W2 mergée.

### X en premier

- Contrats providers dans `@webapp/types` :
  - `ProviderId = 'openai' | 'anthropic' | 'perplexity'`
  - `ProviderCredentialInput` (clé en clair, input uniquement)
  - `ProviderCredentialPublic` (jamais de clé, juste lastFour)
  - `ChatRequest = { windowId, content }`
  - `ChatStreamEvent` normalisé multi-provider :

```ts
type ChatStreamEvent =
  | { type: 'start', messageId: string }
  | { type: 'delta', text: string }
  | { type: 'usage', tokensIn: number, tokensOut: number }
  | { type: 'end', finishReason: 'stop' | 'length' | 'error' }
  | { type: 'error', code: string, message: string }
```

- ADR-0006 finalisé : `ProviderAdapter` interface

### L en parallèle

- Module de chiffrement AES-256-GCM + `MASTER_ENCRYPTION_KEY`
- Endpoints `/credentials` POST / GET (masqué) / DELETE
- `ProviderAdapter` interface + `OpenAIAdapter`
- POST `/windows/:id/messages` : persiste user msg, appelle provider streaming, persiste chunks, retourne flux SSE
- Tests : chiffrement, masquage, provider mocké

### E en parallèle

- Page `/settings/credentials`
- Chat UI : `EventSource` sur endpoint SSE, rend deltas en direct
- États idle / streaming / error / done
- Sélection modèle par window
- System prompt éditable par window

### Critères de sortie

- User connecté ajoute clé OpenAI → crée window → envoie message → voit réponse streamer → retrouve après reload
- Clé jamais retournée en clair
- Clé chiffrée en DB
- Tests verts

---

## Hors Phase 2

Explicitement reportés :

- Multi-provider parallèle (Anthropic, Perplexity)
- Comparaison parallèle d'un même prompt
- Orchestration multi-IA
- Mobile
- Déploiement
- Collaboration multi-user
- Upload attachments réel
- Résumé automatique de contexte
- OAuth
- Plugins tiers
- Features sociales
