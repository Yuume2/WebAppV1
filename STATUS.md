# STATUS WebAppV1

> Maintenu par X uniquement. À lire en début de toute session E ou L.

**Dernière MAJ :** 2026-04-23 par X
**Vague active :** W0 — Ground truth & guardrails

---

## Phase 2 — Vue d'ensemble

| Vague | État | Résumé |
|---|---|---|
| W0 — Ground truth & guardrails | 🟡 en cours | Audit + ADRs + CI + CLAUDE.md + briefs |
| W1 — Fondation persistance | ⚪ à venir | SQLite + Prisma + repositories + client API typé |
| W2 — Auth & écriture | ⚪ à venir | Sessions + signup/login + endpoints write + scoping |
| W3 — Premier provider (OpenAI) | ⚪ à venir | BYOK + AES-256-GCM + streaming SSE |

---

## Mergé

*(rien pour l'instant — Phase 2 démarre)*

## En cours

- [X] W0-01 — Audit repo & project-memory canonique
- [X] W0-02 — ADRs Phase 2
- [X] W0-03 — Mise à jour CLAUDE.md avec charte
- [X] W0-04 — CI guardrails
- [X] W0-05 — Scripts dev & conventions
- [X] W0-06 — Brief Vague 1 pour E et L

## Bloqué / à coordonner

- Rien.

---

## Prochaine vague

**W1 — Fondation persistance**

Démarre quand les 6 PRs W0 sont mergées. Brief détaillé dans
`project-memory/briefs/w1-persistance-L.md` et
`project-memory/briefs/w1-api-client-E.md`.

---

## Références

- Charte : [`project-memory/CHARTE.md`](project-memory/CHARTE.md)
- ADRs : [`docs/adr/`](docs/adr/)
- Briefs actifs : [`project-memory/briefs/`](project-memory/briefs/)
- Règles agents : [`CLAUDE.md`](CLAUDE.md)
