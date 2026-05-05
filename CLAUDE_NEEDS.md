# Claude Needs

Open decisions, classified by what they actually block. Yume answers inline
by editing this file.

---

## Bloquant maintenant (immédiat)

**Aucun.** Toutes les fondations safe sont en place. Tests verts (68/68
tooling, 516 backend, 6 typecheck packages). Branche dédiée
`chore/autonomous-task-system-foundation` avec 36 changements non commités,
zéro perte.

---

## Bloquant avant Phase 2 active (`task:run --exec`)

### B2-1. Branch protection sur `main`

- État : non protégée (`gh api .../branches/main/protection` → 404).
- Action côté GitHub UI, pas code. Voir `docs/ops/branch-protection-checklist.md`.
- Pourquoi bloquant : sans protection, l'agent peut bypass review/CI accidentellement.

**Réponse Yume :**


### B2-2. Stratégie commit / PR pour la branche actuelle

- 36 fichiers nouveaux/modifiés sur `chore/autonomous-task-system-foundation`.
- Trois découpes possibles :
  1. **3 PR** (recommandé) :
     - PR-A : templates issue + PR (`.github/`)
     - PR-B : tools read-only (next, stale, score, deps, meta, doctor) + tests + docs read-only
     - PR-C : tools mutating (questions, guard, runner, backfill) + Phase 2 workflow + Phase 3 scaffolding (n8n, notion-questions) + docs ops
  2. **2 PR** : groupe par "fondations" (A+B) puis "runner + scaffolding" (C).
  3. **1 PR** : tout d'un coup, plus rapide à reviewer mais > 1500 lignes.

**Réponse Yume :**


### B2-3. Backfill task-meta sur les 10 issues ouvertes

- Preview live capturée dans `docs/ops/task-meta-backfill-preview.md` (10/10 patcheraient `acLastVerifiedAt` + `acLastVerifiedCommit`).
- Apply : `pnpm task:meta:backfill -- --yes --confirm "I MEAN IT"`.
- Pourquoi bloquant Phase 2 : sans `acLastVerifiedAt`, le scoring pénalise toutes les issues de -40 et la formule devient peu discriminante.

**Réponse Yume :**


### B2-4. Validation passage `--exec` complet

- Aujourd'hui `--exec` ne fait que (a) status In Progress + (b) `git switch -c`.
- Étape suivante (optionnelle) : `--exec` lance Claude CLI avec le prompt prêt-à-coller (`docs/ops/autonomous-claude-code-prompt.md`).
- Alternative simple : tu lances Claude manuellement avec le prompt après `--exec`.

**Recommandation Claude** : option B (lancement manuel). L'opérateur garde le contrôle, Claude ne s'auto-démarre pas. Aucun coût caché.

**Réponse Yume :**


---

## Bloquant avant Phase 3 (Notion + WhatsApp + n8n)

### B3-1. Notion Questions database

- Schema dans `scripts/notion/questions-schema.md`.
- Action : créer la DB Notion, partager avec une intégration, copier l'ID dans secret repo `NOTION_QUESTIONS_DATABASE_ID`.

**Réponse Yume :**


### B3-2. Notion token (réutilisation ou nouvelle intégration)

- Tu peux réutiliser l'intégration existante `WebAppV1 Sync` (déjà liée à la DB Tasks) ou en créer une dédiée `WebAppV1 Questions`.
- Recommandation Claude : nouvelle intégration `WebAppV1 Questions`, scope minimal (lecture/écriture sur la DB Questions seulement).

**Réponse Yume :**


### B3-3. n8n cloud workspace + crédentials

- Workspace : `yumeee.app.n8n.cloud` (existant).
- Crédentials à créer : `webappv1-github` (PAT scope `repo`), `webappv1-notion` (token de B3-2), `webappv1-whatsapp` (B3-4).
- Workflows à importer : `scripts/n8n/webappv1-question-to-whatsapp.json`, `scripts/n8n/webappv1-notion-answer-to-github.json`.

**Réponse Yume :**


### B3-4. WhatsApp provider

- Choix : Twilio sandbox vs Meta Cloud API. Voir `docs/ops/whatsapp-notif.md`.
- Recommandation Claude : Twilio sandbox d'abord (5 min setup, gratuit en sandbox).

**Réponse Yume :**


### B3-5. GitHub webhook → n8n

- Le workflow `webappv1-question-to-whatsapp` attend un webhook GitHub `Issue comments`.
- Action : repo Settings → Webhooks → New webhook → URL n8n + events `Issue comments` only.
- Bloquant pour la notif WhatsApp instantanée. Sans, on tombe sur un cron 5 min côté Notion.

**Réponse Yume :**


---

## Bloquant avant Phase 4 (boucle multi-task)

### B4-1. Compte GitHub bot dédié

- Ex : `claude-bot-yumeee`. Audit trail séparé du compte humain.
- Pas urgent en Phase 0-3 : tu commit et l'agent commit sous le même compte tant que tu pilotes.

**Réponse Yume :**


### B4-2. Budget exact runner

- Defaults proposés : max 3 PR / run, 60 min wallclock, 1M tokens.
- À confirmer ou ajuster avant que `task-loop.mjs` (futur) soit codé.

**Réponse Yume :**


### B4-3. Loop policy

- Comportement attendu si plus aucune task safe disponible : stop clean ou attente bloquante d'une réponse en cours ?
- Comportement si test failure répété sur 3 tasks d'affilée : pause session ou continuer ?

**Réponse Yume :**


### B4-4. Reporting final

- Format actuel proposé dans `docs/ops/autonomous-claude-code-prompt.md` (section "Final report").
- Phase 4 ajouterait un push vers Notion / WhatsApp / Slack ?

**Réponse Yume :**


---

## Décisions par défaut déjà prises (toutes safe + réversibles)

1. **Branche dédiée** créée : `chore/autonomous-task-system-foundation`. Rien commité, rien poussé.
2. **AC linter strict** par défaut dans `apply-issue-delta.mjs`. Bypass d'urgence : `LINT_AC=warn`. Le delta example actuel passe en strict.
3. **Backfill task-meta non exécuté** : script existant en DRY-RUN par défaut. Apply demande `--yes --confirm "I MEAN IT"`.
4. **`--loop` refusé explicitement** dans `task-runner.mjs`. Loop sera un script séparé Phase 4.
5. **`--exec` minimal** : status In Progress + branche locale. Pas de commit, pas de push, pas de PR. Le code/test/PR restent au pilote humain pour Phase 2.
6. **`--plan-only` tolère working tree dirty** (read-only par nature). `--exec` continue à refuser dirty.
7. **Workflow GitHub Action** `task-runner.yml` : `workflow_dispatch` only, pas de cron, planner read-only.
8. **Phase 3 entièrement scaffoldée mais désactivée** : code, schema, workflows n8n présents ; aucun secret consommé ; aucune intégration créée externe.
9. **Aucune modification GitHub externe** : ni issues, ni labels, ni protection, ni secrets.
10. **`task-doctor`** lit l'état complet du système et n'échoue jamais sur Phase 3 manquante (`n/a`, pas `fail`).
11. **Naming scripts** cohérent : `task:next`, `task:score`, `task:queue`, `task:deps`, `task:stale`, `task:guard`, `task:doctor`, `task:run`, `task:run:plan`, `task:meta`, `task:meta:check`, `task:meta:backfill`, `task:questions`, `task:questions:list`, `task:test`.

---

## Informations techniques manquantes

Aucune pour la suite Phase 0–2 setup-only. Phase 3 dépend de B3-1/B3-2/B3-3/B3-4/B3-5.

---

## Prochaines actions possibles (sans bloquer Yume)

**Toi peux faire pendant que je continue à préparer :**
- Activer branch protection (B2-1)
- Décider la stratégie de PR (B2-2)
- Lire le preview backfill, donner OK/refus (B2-3)
- Lire `docs/ops/first-autonomous-run.md` et tester le prompt sur 1 task

**Moi peux faire (en autonome safe) :**
- (déjà fait) Phase 1 complète, Phase 2 scaffoldée, Phase 3 scaffoldée
- Préparer `tools/task-loop.mjs` Phase 4 (refusé par défaut, requiert flag explicite)
- Étoffer `docs/ops/autonomous-claude-code-prompt.md` avec des variantes (single-task pinned, plan-only-only)
- Préparer un script `tools/task-meta-enrich.mjs` qui propose `suspectedFiles` / `expectedValidationCommand` à partir du body de chaque issue, en dry-run
- Préparer un workflow n8n `webappv1-pr-merged-summary.json` (Phase 4)

Dis "continue" pour que je fasse les 4 derniers points, ou nomme ce qui te manque.
