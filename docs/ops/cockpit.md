# Cockpit (Local Control)

Le cockpit local-control pilote Claude Code, l'autopilot V5 et les
intégrations Notion / n8n / WhatsApp depuis un navigateur.

## Activer l'exec réel

Le bouton **Start Autopilot** affiche le mode actif sous lui :

| Settings | Mode |
|---|---|
| `allowExec=false` | prompt-only — copie le prompt dans `yu` |
| `allowExec=true` + `allowLoop=false` | run-one — une PR puis stop |
| `allowExec=true` + `allowLoop=true` | loop max `maxPrsPerRun` |

Pour passer en exec réel :
1. Settings → toggle **Autoriser exec**.
2. Vérifie `maxPrsPerRun` (défaut 2) et `maxMinutes` (défaut 60).
3. Reste sur `main`, repo clean.
4. Click **Start Autopilot** sur Overview.

Pour stopper : bouton **Stop**, ou `pnpm cockpit` Ctrl+C tue tout.

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

## Lancer une task en 5 étapes

1. `pnpm cockpit` — le navigateur s'ouvre.
2. Sur **Overview**, regarde la card **Task sélectionnée** : l'autopilot a déjà choisi la meilleure issue safe.
3. Clique **Prepare run** — le prompt apparaît dans la card.
4. Clique **Copy prompt** — le prompt va dans le clipboard.
5. Colle-le dans `yu` au terminal (ou clique **Start Autopilot** si `allowExec=true`).

Si la card affiche **Aucune task safe**, déplie **Tasks bloquées** pour voir pourquoi chaque issue est exclue (label manquant, label bloquant, stale).

Le bouton **Run doctor** rafraîchit la card **Doctor** : tu vois quels checks passent, quelles phases sont prêtes, et les recommandations explicites — pas de logs bruts.

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
