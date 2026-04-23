# ADR-0006 — Abstraction `ProviderAdapter` pour les providers IA

**Statut :** Accepté
**Date :** 2026-04-23
**Auteur :** X

---

## Contexte

La Vague 3 introduit le premier appel provider réel (OpenAI). Les Vagues
suivantes ajouteront Anthropic puis Perplexity. Chaque provider expose un SDK
différent, des modèles différents, un format de streaming différent, et des
paramètres spécifiques.

Sans abstraction, le code d'orchestration (endpoint `POST /windows/:id/messages`,
comptage des tokens, persistance) devient un gros switch par provider et duplique
la logique.

Exigences :

- Ajouter un provider = écrire un nouvel adapter, rien d'autre
- Le reste du backend ne connaît que l'interface
- Le format de streaming exposé est celui d'ADR-0004 (`ChatStreamEvent`)
- Testabilité : mock adapter facile à écrire

---

## Décision

**Interface `ProviderAdapter` à implémenter par chaque provider.**

### Emplacement

```
apps/api/src/providers/
├── adapter.ts              // interface
├── registry.ts             // lookup par providerId
├── openai.adapter.ts       // W3
├── anthropic.adapter.ts    // W4
├── perplexity.adapter.ts   // W4+
└── __tests__/
    └── mock.adapter.ts
```

### Interface

```ts
import type { ChatStreamEvent, ProviderId } from '@webapp/types';

export interface ChatInput {
  model: string;
  systemPrompt?: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  temperature?: number;
  maxTokens?: number;
}

export interface ProviderAdapter {
  readonly providerId: ProviderId;

  /**
   * Retourne la liste des modèles disponibles pour ce provider.
   * Peut être statique ou appeler l'API provider.
   */
  listModels(apiKey: string): Promise<Array<{ id: string; label: string }>>;

  /**
   * Appelle le provider et streame la réponse sous forme d'événements
   * normalisés. L'implémentation traduit le format natif du provider.
   */
  stream(input: ChatInput, apiKey: string): AsyncIterable<ChatStreamEvent>;

  /**
   * Vérifie qu'une clé API est valide (appel léger côté provider).
   * Utilisé au moment du POST /credentials.
   */
  validateKey(apiKey: string): Promise<boolean>;
}
```

### Registry

```ts
// apps/api/src/providers/registry.ts
export function getAdapter(providerId: ProviderId): ProviderAdapter {
  // switch interne sur providerId
}
```

Le registry est le seul endroit qui connaît la liste des providers concrets.
L'orchestrateur de chat utilise `getAdapter(credential.providerId).stream(...)`.

### Responsabilités de l'adapter

- Traduit l'entrée normalisée vers le format natif du provider
- Appelle le SDK officiel du provider (pas de fetch brut)
- Consomme le streaming natif, émet des `ChatStreamEvent`
- Gère les erreurs provider et les traduit en `{ type: 'error', code: 'PROVIDER_*', message }`
- Ne persiste rien, ne touche pas à la DB, ne connaît pas l'user
- Ne log jamais la clé API

### Ce que l'adapter NE fait PAS

- Pas de persistance des messages — c'est le service chat qui persiste
- Pas de gestion de session ou d'user
- Pas de gestion du rate limiting global — c'est le middleware
- Pas de choix du modèle — le modèle arrive en input

---

## Conséquences

**Positives :**

- Ajout d'Anthropic en W4 = un fichier à écrire + une ligne dans le registry
- Tests d'intégration du chat avec un mock adapter déterministe
- Les bugs spécifiques à un provider restent localisés

**Négatives :**

- Une fine couche d'indirection — coût négligeable, bénéfice énorme
- Si un provider expose une feature unique (ex. tool use avec format spécifique), il faudra étendre l'interface — acceptable, sera traité quand on y sera

**Impact code :**

- W3 : écrire `adapter.ts`, `registry.ts`, `openai.adapter.ts`, tests avec mock
- W4+ : ajouter les autres adapters

---

## Alternatives rejetées

- **Pas d'abstraction, switch par providerId dans l'orchestrateur :** duplication et couplage. Rejeté.
- **Une lib tierce type `ai-sdk` de Vercel :** crée une dépendance au cycle de releases d'un tiers, et son API change. On garde le contrôle.
- **Une interface plus riche (tool use, function calling, vision) dès W3 :** prématuré. On étend quand on en a besoin, avec un ADR ciblé.
- **Un process séparé par provider :** overkill pour Phase 2.
