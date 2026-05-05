# Local Control Panel — Cockpit Local

Cockpit web local pour piloter Claude Code en mode semi-autonome sur WebAppV1.

## Architecture

- **Backend** : `tools/local-control/server.mjs` (responsabilité de Claude A — non inclus dans cette PR).
- **Frontend** : `tools/local-control/public/` — HTML + JS modules ESM, zéro dépendance, servi statiquement par le backend.
- **Contrat API** : `tools/local-control/api-contract.json` (côté UI). À aligner avec l'implémentation backend.
- **Bind par défaut** : `127.0.0.1` (loopback). LAN désactivé par défaut.

## Pages

| Pane       | Rôle |
|------------|------|
| Dashboard  | branche, git status, doctor, protection main, phase gates, compteurs, dernier run |
| Tasks      | table issues exécutables — score, classification, risk, autonomy ; boutons Plan / Run |
| Runner     | démarrer un run plan/exec/loop avec garde-fous |
| Prompt     | prompt libre + presets (plan-next, run-one-safe, loop-safe, resume-after-answer, analyze-blockage) |
| Logs       | flux SSE temps réel + historique runs |
| Questions  | questions humaines en attente — réponse renvoyée vers GitHub via n8n |
| Settings   | maxPRs, maxMinutes, dry-run, allowExec, allowLoop, allowAutoMerge, staleDays, allowed labels/risk/autonomy |

## Lancer

Backend (Claude A — quand prêt) :

```bash
node tools/local-control/server.mjs
# par défaut http://127.0.0.1:8787
```

Ouvre le navigateur sur `http://127.0.0.1:8787`. L'UI est servie depuis `tools/local-control/public/`.

## Tester l'UI seule (sans backend)

Tu peux servir le dossier statique pour valider le rendu :

```bash
npx serve tools/local-control/public
```

Les appels API échoueront (pas de serveur), mais le layout, la navigation, les confirmations et les validations fonctionnent.

## Tests JS

```bash
node --test tools/local-control/tests/
```

Couvre :
- redaction côté client
- validation formulaires runner / settings
- client API (fetch mocké)

## Sécurité

Voir `docs/ops/local-control-security.md`.

## Téléphone

Voir `docs/ops/local-control-phone.md`.
