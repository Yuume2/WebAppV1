# ADR-0003 — Chiffrement des clés providers au repos (secrets-at-rest)

**Statut :** Accepté
**Date :** 2026-04-23
**Auteur :** X

---

## Contexte

WebAppV1 adopte un modèle BYOK : chaque user fournit ses propres clés API
(OpenAI, Anthropic, Perplexity). Ces clés donnent accès à des ressources
payantes et doivent être traitées comme des secrets.

Exigences :

- La DB peut être compromise (backup volé, fuite de `dev.db`, future bdd cloud)
- Aucune clé ne doit jamais apparaître en clair dans les logs, les réponses API, les erreurs
- L'utilisateur ne peut jamais relire sa clé après soumission (principe write-only côté user)
- Pas de dépendance à un KMS cloud en Phase 2

---

## Décision

**Chiffrement AES-256-GCM au niveau applicatif, clé maître depuis variable d'environnement.**

### Clé maître

- Variable d'environnement : `MASTER_ENCRYPTION_KEY`
- Format : 32 bytes encodés en base64 (256 bits)
- Générée une fois par l'opérateur : `openssl rand -base64 32`
- Documentée dans `.env.example` (sans valeur)
- En prod : gérée par le système de secrets de l'hébergeur (à trancher plus tard)

### Chiffrement

- Algorithme : AES-256-GCM (authenticated encryption)
- IV : 12 bytes aléatoires par chiffrement, stocké avec le ciphertext
- Tag d'authentification : 16 bytes, stocké avec le ciphertext
- Format stocké en DB : `base64(iv) + ':' + base64(tag) + ':' + base64(ciphertext)`

### Modèle DB

Table `ProviderCredential` :

```
id: string (UUID)
userId: string
providerId: enum ('openai' | 'anthropic' | 'perplexity')
label: string               // libellé user-facing (ex. "Ma clé perso OpenAI")
encryptedKey: string        // blob chiffré format ci-dessus
lastFour: string            // 4 derniers caractères de la clé en clair, pour affichage
createdAt: Date
deletedAt: Date?            // soft-delete
```

### API

- `POST /credentials` — accepte la clé en clair, la chiffre, stocke
- `GET /credentials` — retourne la liste **sans `encryptedKey`** : juste `id`, `providerId`, `label`, `lastFour`, `createdAt`
- `DELETE /credentials/:id` — soft-delete
- **Aucun endpoint ne retourne jamais la clé en clair**

### Utilisation en runtime

- Au moment d'un appel provider, L déchiffre la clé en mémoire pour la requête, puis la libère
- Jamais loggée, jamais sérialisée dans une réponse, jamais retournée dans une erreur

---

## Conséquences

**Positives :**

- Si la DB fuite sans la master key, les clés sont inutilisables
- Cohérent avec les pratiques standards (Vault, KMS utilisent le même pattern applicatif)
- Migration vers KMS plus tard = juste remplacer le module `crypto.ts`

**Négatives :**

- Si la `MASTER_ENCRYPTION_KEY` fuite, toutes les clés sont déchiffrables — c'est le trade-off de ne pas avoir de KMS
- Rotation de la clé maître = requiert une migration qui déchiffre + rechiffre tout. Documenté dans `docs/operations/key-rotation.md` à créer en Phase 3.

**Impact code :**

- Module : `apps/api/src/security/crypto.ts` exposant `encrypt(plaintext)` / `decrypt(ciphertext)`
- Tests unitaires du module obligatoires
- Le logger (pino) est configuré avec une liste de redaction qui cache `encryptedKey`, `key`, `password`, `authorization`

---

## Alternatives rejetées

- **Pas de chiffrement (confiance DB) :** inacceptable vu que la DB peut fuiter et que les clés donnent accès à des ressources payantes.
- **KMS cloud (AWS KMS, GCP KMS) :** couplage à un cloud avant d'avoir choisi l'hébergeur. Reporté.
- **Chiffrement au niveau DB (TDE Postgres) :** protège contre le vol de disque, pas contre un dump DB ou un SQL injection. Insuffisant seul.
- **Stockage dans un gestionnaire système (Keychain macOS, libsecret Linux) :** ne survit pas au déploiement cloud.
