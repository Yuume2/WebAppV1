# Local Control — Sécurité

Le cockpit local pilote Claude Code, lit le repo, lance des commandes shell, peut créer des PR et merger. Surface d'attaque à prendre au sérieux.

## Principes

1. **Loopback par défaut.** Backend bind `127.0.0.1`. LAN nécessite opt-in explicite + warning UI.
2. **Pas de secrets dans le navigateur.** Aucun token API jamais envoyé au client. Le backend redige les logs avant de les pousser via SSE.
3. **Redaction défense en profondeur.** L'UI re-redige tout ce qu'elle reçoit (`tools/local-control/public/lib/redact.js`).
4. **Confirmations fortes.** Toute action destructrice (exec/loop/auto-merge) demande de taper un mot magique (`EXEC`, `LOOP`, `AUTOMERGE`).
5. **Whitelist labels/risk/autonomy.** Settings imposent une liste autorisée — runner refuse si une issue n'y rentre pas.
6. **Auto-merge protégé.** Le backend exige header `X-Confirm-AutoMerge: yes` ET `allowAutoMerge=true` ET dry-run désactivé.

## Modes opérationnels

| Mode      | Effet réseau | Auto-merge | Loop | Recommandation |
|-----------|--------------|------------|------|----------------|
| Dry-run   | Loopback     | jamais     | jamais | défaut quotidien |
| Live      | Loopback     | si activé  | si activé | session supervisée |
| LAN       | Réseau local | déconseillé | déconseillé | usage temporaire téléphone |

## Badges UI

- `DRY-RUN` (vert) : aucune action destructrice possible.
- `LIVE` (orange) : actions réelles.
- `LAN` (orange) : accessible depuis le réseau local.
- `AUTO-MERGE` (rouge) : PR fusionnés automatiquement.

## Token bearer (LAN)

Si LAN activé, exiger un token :

```jsonc
// settings.local.json côté backend
{
  "localControl": {
    "lan": { "enabled": true, "host": "0.0.0.0", "port": 7878 },
    "token": "<random 32+ chars>"
  }
}
```

L'UI le lit depuis `localStorage.localControlToken` ou un prompt au premier accès.

## Liste de contrôle avant `Live`

- [ ] Branche propre ou backup poussé.
- [ ] `task:doctor` vert.
- [ ] Settings pose `dryRunDefault=false` consciemment.
- [ ] `allowAutoMerge` désactivé sauf nécessité documentée.
- [ ] Logs en cours de visionnage.

## Risques résiduels

- Backend peut exécuter du shell — un attaquant local sur la machine peut tout faire de toute manière.
- LAN expose à tous les appareils du Wi-Fi local — utiliser un Wi-Fi de confiance.
- Si le repo contient un hook git malveillant, lancer `task-runner` peut l'exécuter. Mitiger via revue git régulière.
