# ADR-0004 — Streaming : SSE avec format d'événement normalisé multi-provider

**Statut :** Accepté
**Date :** 2026-04-23
**Auteur :** X

---

## Contexte

La Vague 3 introduit les appels providers réels avec streaming des réponses.
Plusieurs providers sont prévus (OpenAI d'abord, puis Anthropic, puis Perplexity),
chacun avec son propre format de streaming natif :

- OpenAI : SSE avec `data: {choices: [{delta}]}` + `finish_reason`
- Anthropic : SSE avec `message_start`, `content_block_delta`, `message_stop`, etc.
- Perplexity : compatible OpenAI

Si `@webapp/types` expose le format natif d'un provider, l'ajout du suivant force
une réécriture du contrat — donc une casse du frontend. Il faut une abstraction.

Exigences :

- Streaming temps réel des deltas de texte
- Un seul format d'événement côté contrat `@webapp/types`
- Support de métadonnées (tokens, finish reason, erreurs)
- Pas de WebSocket (unidirectionnel suffit)
- Compatible avec `EventSource` côté browser natif

---

## Décision

**Transport : SSE (Server-Sent Events).**

**Format d'événement : `ChatStreamEvent` normalisé, agnostique du provider.**

### Transport

- Endpoint : `POST /windows/:id/messages`
- Content-Type de la réponse : `text/event-stream`
- Chaque événement : `data: <JSON>\n\n`
- Le serveur garde la connexion ouverte pendant toute la génération
- Fermeture explicite via événement `end` puis fermeture HTTP

Côté client (`apps/web`) : utilisation de `fetch` avec reader streaming (pas
`EventSource` natif car il ne supporte pas POST avec body JSON). Helper
dans `apps/web/src/lib/api/stream.ts`.

### Format d'événement normalisé

Défini dans `packages/types` :

```ts
export type ChatStreamEvent =
  | { type: 'start'; messageId: string }
  | { type: 'delta'; text: string }
  | { type: 'usage'; tokensIn: number; tokensOut: number }
  | { type: 'end'; finishReason: 'stop' | 'length' | 'content_filter' | 'error' }
  | { type: 'error'; code: string; message: string };
```

Règles :

- `start` toujours en premier, une seule fois
- `delta` peut être émis 0 à N fois
- `usage` émis une fois à la fin si le provider le fournit
- `end` toujours en dernier en cas de succès
- `error` remplace `end` en cas d'échec
- Le client peut dériver le contenu complet en concaténant tous les `delta.text`

### Responsabilité du `ProviderAdapter`

Chaque adapter (OpenAI, Anthropic, …) traduit le streaming natif du provider
en suite d'événements `ChatStreamEvent`. Le frontend ne connaît jamais le
format natif du provider. Voir ADR-0006.

---

## Conséquences

**Positives :**

- Ajout d'Anthropic en Vague 4 = nouvel adapter, zéro changement de contrat
- `EventSource`-style côté client, débogable avec les DevTools Network
- Pas de surcoût WebSocket (handshake, ping/pong, reconnexion custom)
- Compatible avec les infras HTTP standard (pas besoin de sticky sessions pour le streaming simple)

**Négatives :**

- SSE ne supporte pas le binary natif — non bloquant, on streame du texte
- SSE natif côté browser ne supporte pas POST — contourné avec fetch + ReadableStream
- Certains proxies buffer SSE — à surveiller au déploiement, pas un problème en local

**Impact code :**

- `apps/api/src/streaming/sse.ts` — helper serveur pour émettre des événements typés
- `apps/web/src/lib/api/stream.ts` — helper client pour consommer le flux typé
- Tests : un adapter mocké qui émet une séquence déterministe d'événements

---

## Alternatives rejetées

- **WebSocket :** bidirectionnel inutile ici, complexité de connexion/reconnexion, pas d'avantage pour ce use case.
- **Long-polling :** latence plus élevée, implémentation manuelle du chunking. SSE fait mieux.
- **Format natif OpenAI exposé directement :** couple le contrat à un provider, force une migration à l'ajout du suivant. Rejeté.
- **gRPC streaming :** surcoût infra (proto, génération de code), incompatible avec le browser sans Envoy. Overkill.
