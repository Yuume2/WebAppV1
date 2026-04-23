# ADR-0005 — Enveloppe de réponse API : `{ ok, data | error }`

**Statut :** Accepté
**Date :** 2026-04-23
**Auteur :** X

---

## Contexte

Le backend actuel mélange plusieurs formes de réponses selon les endpoints.
Avec l'ajout d'auth, d'écriture, de streaming et de providers en Phase 2, le
risque de divergence devient bloquant pour le frontend (E doit écrire des
handlers différents par endpoint).

Exigences :

- Un format unique pour tous les endpoints non-streaming
- Discrimination claire entre succès et erreur
- Codes d'erreur stables, utilisables côté client pour afficher des messages typés
- Pas de dépendance à une lib externe

---

## Décision

**Enveloppe discriminée par `ok: boolean`.**

### Succès

```ts
{ ok: true, data: T }
```

Le status HTTP est toujours `2xx` en cas d'`ok: true`.

### Erreur

```ts
{
  ok: false,
  error: {
    code: string,
    message: string,
    details?: unknown
  }
}
```

Le status HTTP reflète la nature de l'erreur (voir table ci-dessous). Le champ
`code` est stable et documenté. Le champ `message` est safe à afficher à l'user.
Le champ `details` est optionnel (typiquement utilisé pour les erreurs de validation Zod).

### Types dans `@webapp/types`

```ts
export type ApiOk<T> = { ok: true; data: T };

export type ApiError = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type ApiResponse<T> = ApiOk<T> | ApiError;
```

### Table des codes d'erreur standards

| Code | HTTP | Sens |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Payload invalide (détails dans `details`) |
| `UNAUTHENTICATED` | 401 | Pas de session |
| `FORBIDDEN` | 403 | Session valide mais accès refusé à la ressource |
| `NOT_FOUND` | 404 | Ressource inexistante ou hors scope user |
| `CONFLICT` | 409 | Conflit (ex. email déjà utilisé) |
| `RATE_LIMITED` | 429 | Trop de requêtes |
| `PROVIDER_ERROR` | 502 | Erreur remontée d'un provider IA |
| `INTERNAL_ERROR` | 500 | Erreur serveur non attendue |

Tout code custom est préfixé par domaine : `AUTH_*`, `CREDENTIAL_*`, `PROVIDER_*`.

### Exceptions : streaming

Les endpoints streaming SSE (`ChatStreamEvent`) **ne suivent pas cette
enveloppe** — ils suivent le format défini dans ADR-0004. Un événement
`{ type: 'error', code, message }` remplace l'enveloppe d'erreur HTTP.

---

## Conséquences

**Positives :**

- Un seul handler côté client pour toutes les réponses non-streaming
- Discrimination TypeScript automatique avec `if (res.ok)`
- Codes d'erreur stables permettent de traduire / personnaliser côté UI sans parser le message

**Négatives :**

- Plus verbeux qu'un retour direct (`data` au lieu de l'objet directement)
- Un client qui attend juste le payload doit faire `.data` — règle simple

**Impact code :**

- Helper serveur : `apps/api/src/http/respond.ts` exposant `ok(res, data)` et `fail(res, status, code, message, details?)`
- Helper client : `apps/web/src/lib/api/client.ts` déballe l'enveloppe et throw une `ApiError` typée si `ok: false`
- Toute route backend passe par le helper — règle enforcée par review

---

## Alternatives rejetées

- **Retour direct du data en cas de succès, objet `{error}` en cas d'erreur :** ambiguïté du typage TypeScript, plus dur à discriminer.
- **Format JSON:API :** trop verbeux pour notre cas (pas de relations complexes exposées côté client).
- **gRPC-style status codes dans le body :** duplique le status HTTP, pas de gain.
- **Throw côté serveur avec un handler global qui formate :** acceptable mais plus fragile — on préfère l'explicite.
