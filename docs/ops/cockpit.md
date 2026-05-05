# Cockpit (Local Control)

Le cockpit local-control pilote Claude Code, l'autopilot V5 et les
intégrations Notion / n8n / WhatsApp depuis un navigateur.

## Lancer en 1 commande

```bash
pnpm cockpit          # serveur + ouvre le navigateur (token auto-injecté)
pnpm cockpit:lan      # même chose, accessible depuis le téléphone (LAN)
pnpm cockpit:headless # serveur sans ouvrir le navigateur
```

`pnpm cockpit` :
- libère le port 8787 si occupé,
- démarre le backend,
- attend que `/api/health` réponde,
- ouvre `http://127.0.0.1:8787?token=…` (token lu dans `.local-control/settings.json`).

## Pages

Le cockpit a 3 onglets :

| Onglet | Contenu |
|---|---|
| **Overview** | Autopilot hero, statut système, métriques, accès téléphone |
| **Workspace** | Workflow 4 étapes, tâches, questions humaines, logs, outils avancés (runner manuel, prompt libre, V5 prepare) |
| **Settings** | Exécution, budget, réseau, filtres, danger zone (auto-merge) |

## Autopilot

Bouton **Start Autopilot** sur Overview :
- Sélectionne la meilleure task safe (filtre `risk:destructive`,
  `risk:review-required`, `ai:human-checkpoint` ; exige `ai:autonomous` +
  `risk:safe`).
- Génère le prompt structuré.
- Lance `yu` automatiquement si `allowExec=true`, sinon mode prompt-only.
- S'arrête sur dirty repo, guard BLOCK, 3 erreurs, time/PR budget,
  question humaine, secret manquant.

Si quelque chose bloque, un bandeau jaune ou rouge explique pourquoi.

## Settings clés

| Toggle | Effet | Défaut |
|---|---|---|
| `dryRunDefault` | Plan only par défaut | ✓ |
| `allowExec` | Autorise l'exécution réelle | OFF |
| `allowLoop` | Autorise loop multi-tasks | OFF |
| `allowAutoMerge` | Auto-merge ultra safe (capacité) | OFF |
| `lanEnabled` | Bind 0.0.0.0 si lancé `--lan` | OFF |

Auto-merge reste OFF par défaut. Voir `docs/ops/automerge-policy.md`.

## Mobile

L'UI est responsive. Tableau des tâches → cartes sur téléphone, boutons
plus larges (touch-target 44px), onglets en barre du bas.

## Sécurité

- Auth token requise (Bearer ou query `?token=`).
- Aucun secret affiché dans les logs (redacteur sur GH/OpenAI/AWS/Twilio + token).
- `.local-control/` gitignored.
- `.claude/` jamais touché.
- Pas de shell libre côté backend, commandes whitelistées.
