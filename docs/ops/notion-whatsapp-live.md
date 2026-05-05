# Notion + WhatsApp + n8n — Pipeline live

Pipeline complet pour les questions humaines posées par Claude Code pendant un run autonome.

```
Claude Code ──(GitHub comment label:claude-question)──▶ GitHub Issue
                                                            │
                                                            ▼
                                              n8n (poll GitHub or webhook)
                                                            │
                                              mirror question → Notion DB Questions
                                                            │
                                                            ▼
                                              n8n → WhatsApp notif (Yume)
                                                            │
                                              Yume répond dans Notion
                                                            │
                                                            ▼
                                              n8n (Notion changement → GitHub)
                                              poste comment label:claude-answer
                                                            │
                                                            ▼
                                              task-runner detect réponse
                                              resume issue
```

## Pré-requis

- Notion DB Questions : `scripts/notion/questions-schema.md` (déjà documenté).
- n8n cloud : `yumeee.app.n8n.cloud`.
- Workflows n8n : 
  - `scripts/n8n/webappv1-question-to-whatsapp.json`
  - `scripts/n8n/webappv1-notion-answer-to-github.json`
- GitHub PAT scope `repo` (réservé à n8n).
- Notion integration token (lecture/écriture sur DB Questions).
- WhatsApp Cloud API ou bridge Twilio.

## Variables n8n (placeholders)

Aucun secret réel n'est commité. Définir dans n8n :

| Var | Description |
|-----|-------------|
| `GITHUB_TOKEN` | PAT scope `repo` |
| `GITHUB_OWNER` | `Yuume2` |
| `GITHUB_REPO` | `WebAppV1` |
| `NOTION_TOKEN` | integration token |
| `NOTION_DB_QUESTIONS` | id DB Questions |
| `WA_PHONE_ID` | WhatsApp Business phone id |
| `WA_TOKEN` | Cloud API token |
| `WA_TO` | numéro Yume au format E.164 |

## Schéma DB Notion Questions

Voir `scripts/notion/questions-schema.md`. Champs minimum :

- `Issue` (number)
- `Question` (rich text)
- `Options` (multi-select)
- `Recommendation` (rich text)
- `Status` (select : open / answered / applied)
- `Answer` (rich text)
- `AnsweredAt` (date)
- `IssueUrl` (url)

## Synchronisation locale

Outils existants :
- `scripts/notion/sync-questions.mjs` — bridge bidirectionnel manuel/CLI.
- `tools/task-questions.mjs` — list/extract questions depuis GitHub.

Le cockpit local affiche les questions via `/api/questions` qui consomme la même source. Quand Yume répond depuis le cockpit, l'API backend crée le commentaire `claude-answer` directement (pas besoin de passer par Notion). Notion reste utile pour répondre **depuis le téléphone hors LAN**.

## Test du pipeline (sans secrets)

1. Importer les workflows dans n8n.
2. Définir des credentials de test (sandbox WhatsApp, Notion DB de dev).
3. Créer une issue manuelle avec label `claude-question` et un commentaire formaté.
4. Vérifier la réception WhatsApp.
5. Répondre dans Notion.
6. Vérifier le commentaire `claude-answer` posté sur l'issue.

## Sécurité

- Secrets uniquement dans n8n (jamais dans le repo).
- Token GitHub n8n distinct de celui de Claude Code.
- DB Notion privée (pas de share public).
- WhatsApp template approuvé pour les notifications hors fenêtre 24h.

## États dégradés

- n8n down : Claude Code peut tout de même attendre une réponse via le cockpit local.
- WhatsApp rate-limited : Yume voit la question dans Notion ou directement dans GitHub.
- Notion down : fallback = répondre directement sur l'issue GitHub avec label `claude-answer`.
