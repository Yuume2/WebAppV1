# ADR-0002 — Authentification : email + password, sessions cookie

**Statut :** Accepté
**Date :** 2026-04-23
**Auteur :** X

---

## Contexte

La Vague 2 introduit le multi-user réel. Chaque endpoint devra être scopé par
`userId`. Aucun mécanisme d'auth n'existe aujourd'hui.

Contraintes :

- Pas de dépendance externe (pas de service email pour magic link)
- Pas d'OAuth maintenant (dépendance à Google / GitHub, complexité UX)
- Pas de SaaS tiers (Auth0, Clerk) — on reste local-first et maîtrisés
- Local + déployable plus tard sans changement majeur

---

## Décision

**Auth email + password, hash argon2id, sessions server-side en DB, cookie httpOnly.**

### Flux

1. **Signup** `POST /auth/signup` :
   - Validation Zod (email valide, password min 10 chars)
   - Hash argon2id (paramètres par défaut d'`argon2` lib : memoryCost 19456, timeCost 2, parallelism 1)
   - Création `User` + création `Session` + set cookie
2. **Login** `POST /auth/login` :
   - Vérifie le hash
   - Crée une `Session`, set cookie
3. **Logout** `POST /auth/logout` :
   - Invalide la session en DB
   - Efface le cookie
4. **Me** `GET /auth/me` :
   - Lit le cookie, charge la session, renvoie l'user

### Cookie

- Nom : `webappv1_session`
- `httpOnly: true`
- `sameSite: 'lax'`
- `secure: true` en prod (NODE_ENV=production)
- `path: '/'`
- TTL : 30 jours, renouvelé à chaque requête authentifiée

### Session en DB

Table `Session` :

```
id: string (UUID)
userId: string
expiresAt: Date
createdAt: Date
userAgent: string?
ipAddress: string?
```

Session révocable à tout moment par suppression de la ligne.

### Rate limiting

- `/auth/signup` : max 5 par IP par heure
- `/auth/login` : max 10 par IP par 15 minutes, max 5 par email par 15 minutes

---

## Conséquences

**Positives :**

- Contrôle total, aucune dépendance tierce
- Sessions révocables en une requête DB (avantage sur JWT)
- argon2id est le standard OWASP actuel
- Ajout d'OAuth plus tard sans migration (juste nouveaux providers sur le même `User`)

**Négatives :**

- Pas de SSO immédiat — acceptable pour la cible power-user technique
- Session lookup à chaque requête authentifiée — coût marginal en SQLite

**Impact code :**

- `apps/api/src/middleware/session.ts` — middleware qui charge la session + user
- `apps/api/src/services/auth.service.ts` — signup, login, logout
- `packages/types` : `AuthUser`, `Session`, `SignupRequest`, `LoginRequest`, `AuthError`
- Toutes les routes existantes deviennent scopées par `userId` en W2

---

## Alternatives rejetées

- **JWT stateless :** invalidation impossible sans blacklist (qui recrée de l'état). Pas de gain sur notre use case.
- **Magic link par email :** nécessite un service email (Resend, SMTP). Complexité + coût sans valeur pour la cible.
- **OAuth seul (Google/GitHub) :** bloque les users qui ne veulent pas lier un compte externe. À ajouter plus tard en plus, pas à la place.
- **Passkeys :** excellent long terme, mais coût d'implémentation non justifié en Phase 2.
- **bcrypt au lieu d'argon2id :** argon2id est recommandé par OWASP depuis 2021, bcrypt est legacy.
