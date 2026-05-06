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

## Modes de mission

Le hero **Mission Control** propose un sélecteur de modes :

| Mode | Action | Settings requis |
|---|---|---|
| **Manual prompt** | Génère un prompt à coller dans `yu`. Aucun spawn. | aucun |
| **Auto · 1 task** | Une PR puis stop. | `allowExec` |
| **Auto · 5 tasks** | Loop jusqu'à 5 PR. **Défaut.** | `allowExec` + `allowLoop` |
| **Loop · 10 tasks** | Loop intensif. | `allowExec` + `allowLoop` |
| **Loop · 20 tasks** | Loop max. | `allowExec` + `allowLoop` |
| **Custom loop** | Tu choisis le budget. | `allowExec` + `allowLoop` |
| **Full autopilot** | Vérifie checklist complète avant de lancer. | tout dont auto-merge |

Cliquer sur un mode met à jour le hero + le sous-titre + le bouton CTA. Le mode est mémorisé dans `localStorage`.

Pour **Full autopilot**, une checklist apparaît avec chaque item (Claude / branch protection / exec / loop / power / guard / Notion / n8n / WhatsApp) et un statut explicite (ready / missing / optional / blocked). Cliquer **Configure** ouvre directement la bonne section de Settings.

## Lire la timeline

Quand l'autopilot tourne, le hero affiche une **mission progress bar** + une **timeline** 7 étapes :

1. Select · 12%
2. Branch · 22%
3. Coding · 50%
4. Tests · 70%
5. Guard · 85%
6. PR · 95%
7. Done · 100%

Chaque étape passe de `gris → violet (active, glow) → vert (done)` au fur et à mesure. Le panneau sous-titre traduit en humain : "Claude is coding…", "Tests are running…", "PR opened.".

Les logs techniques sont disponibles dans le **drawer collapsé** sous l'activité ; clique pour ouvrir, filtrer, copier ou vider.

## Que faire si la mission s'arrête à 50%

C'est le scénario "Claude lancé mais sortie sans PR". L'UI **ne fait plus disparaître** ce cas. Tu vois maintenant :

- Le hero passe en rouge avec le titre `Échec sur #X`.
- La progress bar reste visible avec la couleur danger et `failed` sur l'étape Claude.
- Une carte **Mission result** apparaît juste en dessous avec :
  - Issue traitée
  - Étape où ça a échoué
  - Raison humaine (`claude-failed`, `no-pr-produced`, `guard-block`, etc.)
  - Boutons **Retry** / **Copy diagnostic** / **Open logs** / **Reset**

Procédure de récupération :

1. Clique **Copy diagnostic** → résumé compact (runId, issue, branche, dernière erreur, 10 dernières lignes de log).
2. Vérifie l'issue sur GitHub : Claude a-t-il posté un commentaire `claude-question` ? Si oui le state passe en `waiting_human`.
3. Sinon clique **Retry** — l'engine fait `reset` puis relance `start` sur la même issue.
4. **Reset** seul nettoie le runtime sans relancer.

## Stopper / Reprendre

- **Stop** dans le hero ou via `pnpm autopilot:loop` Ctrl+C → SIGTERM propre.
- **Resume** dans le hero quand le state est `waiting` (question humaine répondue sur GitHub).

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

## Mode unattended (loop robuste)

Quand tu sélectionnes Auto · 5 tasks, Loop · 10 tasks ou Custom loop, le cockpit
passe en mode **unattended run** : tu peux fermer l'onglet et faire autre chose.

### Lancer un unattended run

1. Ouvre le cockpit, choisis un mode loop (`auto5` recommandé).
2. Clique **Start mission**.
3. La carte « Unattended run » apparaît : tâche en cours, queue restante,
   compteurs done / failed / skipped, liste des PR en live.
4. Tu peux fermer l'onglet — la mission continue tant que le serveur tourne.

### Config recommandée

```
allowExec=true
allowLoop=true
allowAutoMerge=false
maxPrsPerRun=5
maxRetriesPerIssue=1
```

Auto-merge reste OFF : tu valides chaque PR manuellement.

### Comportement face aux échecs

- Si Claude exit non-zero sur une issue : la mission marque l'issue **failed**,
  l'exclut du run et passe à la suivante.
- Si Claude exit 0 sans PR : l'issue passe en `no-pr-produced`, exclue du run,
  loop continue.
- Une issue échouée n'est jamais reprise dans le même run.
- Stop propre quand : `maxPrsPerRun` atteint, `maxErrors` atteint, plus aucune
  task safe (`no-safe-task`), time budget dépassé, ou stop manuel.

### Lire le rapport final

Quand la mission termine, la carte **Mission report** s'affiche et persiste
après refresh. Elle contient :

- Outcome : `completed` / `partial` / `failed` / `stopped`.
- Liste cliquable des PR créées (boutons **Open all PRs**, **Copy PR links**).
- Liste des issues échouées avec raison + dernière sortie Claude.
- Issues skipped avec raison.
- **Next action** : ce que tu dois faire ensuite (review PRs, retry, etc.).

Si une seule PR : bouton **Open PR**. Si plusieurs : **Open all PRs** ouvre
chaque lien dans un nouvel onglet, **Copy PR links** met la liste au presse-papier.

### Notifications n8n / Notion / WhatsApp

Adapter `notifier.mjs` envoie des événements à chaque transition :
`mission_started`, `pr_created`, `issue_failed`, `question_required`,
`mission_completed`.

| Provider | Status | Comportement |
|---|---|---|
| Notion | configuré → ready | événements queueables |
| n8n | base configuré + question webhook → ready | POST signé HMAC |
| WhatsApp | optional | ne bloque jamais |

`GET /api/autopilot/notifier` retourne le status + événements récents. Si une
intégration manque, le rapport local reste complet — rien ne crash.

Pour brancher n8n plus tard : ajouter `N8N_BASE_URL`, `N8N_WEBHOOK_SECRET`,
`N8N_QUESTION_NOTIFY_WEBHOOK` dans `.local-control/v5.env`.

Pour WhatsApp : `WHATSAPP_PROVIDER=twilio` + `TWILIO_ACCOUNT_SID/AUTH_TOKEN` +
`WHATSAPP_FROM/TO` (ou `WHATSAPP_PROVIDER=n8n` pour passer par n8n).

## V20 — répondre à une human question depuis le cockpit

Quand Claude pose une question (commentaire `<!-- claude-question v1` sur
l'issue), la mission passe en `waiting`. Le cockpit affiche alors une carte
**Décision humaine** complète :

- titre clair issu du markdown du commentaire
- contexte (« Pourquoi je demande »)
- options sous forme de boutons (clic = pré-remplit la zone de réponse)
- recommandation Claude mise en valeur si présente
- zone de texte libre + bouton « Envoyer la réponse et reprendre »
- raccourci `Cmd/Ctrl+Enter` pour envoyer

L'envoi appelle `POST /api/autopilot/answer-question` qui :

1. Poste un commentaire `<!-- claude-answer qid:... -->` sur l'issue via `gh`.
2. Poste une `<!-- claude-resolution -->` (best-effort).
3. Appelle `engine.resume({ answeredQid })` pour faire repartir la loop.

Le tout se fait sans n8n, sans Notion. Le bridge externe reste optionnel.

### Stale waiting state

Si tu redémarres le serveur cockpit pendant qu'un run était en `waiting`, le
process perd `activeRun`. Le rapport persiste (`/api/autopilot/status` renvoie
`isLive: false, stale: true`) et la carte question affiche un mode dégradé :
bouton **Envoyer la réponse (run précédent)** qui poste sur GitHub uniquement,
et bouton **Reset run** pour repartir d'une mission propre.

## V20 — voir les runs récents

Une nouvelle section **Derniers runs** liste les missions terminées avec :

- outcome (completed / partial / failed / stopped / waiting)
- résumé court
- 1ère PR cliquable
- date + durée

Backend : `GET /api/autopilot/recent` renvoie 8 runs max, filtre les runs actifs.

## V20 — état des PR

Chaque PR créée capture `number`, `url`, `title`, `branch`, `issueNumber` à la
création. Bouton **Refresh PR status** dans le rapport final qui appelle
`POST /api/autopilot/pr-status` ; ça rappelle `gh pr view` pour chaque PR et
ajoute `state` (open / merged / closed / draft). Les badges de la PR list
prennent les couleurs : open=vert, merged=violet, closed=rouge, draft=jaune.

## V20 — activity ticker

Sous le CTA principal, un bandeau live affiche en français ce que fait
Claude **maintenant** : `Préflight…`, `Création de la branche…`,
`Claude is coding…`, `Vérification PR…`, etc. + un compteur done/failed quand
le run est unattended.

## Sécurité

- Auth token requise (Bearer ou query `?token=`).
- Aucun secret affiché dans les logs (redacteur sur GH/OpenAI/AWS/Twilio + token).
- `.local-control/` gitignored.
- `.claude/` jamais touché.
- Pas de shell libre côté backend, commandes whitelistées.
