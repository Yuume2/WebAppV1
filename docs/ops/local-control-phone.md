# Local Control — Accès Téléphone

L'UI est responsive et utilisable depuis un téléphone tant que l'appareil est sur le **même réseau Wi-Fi** que la machine de Yume.

## Activer le mode LAN

Par défaut, le backend écoute sur `127.0.0.1` (loopback) — invisible depuis le téléphone.

Pour ouvrir au LAN :
1. Modifier la config backend (Claude A) → `lan.enabled = true`, bind `0.0.0.0`.
2. Redémarrer le serveur.
3. L'UI affiche un badge `LAN` orange en haut à droite.

## Trouver l'IP locale du Mac

```bash
ipconfig getifaddr en0      # Wi-Fi
ipconfig getifaddr en1      # Ethernet (selon machine)
```

Exemple : `192.168.1.42` → ouvrir sur le téléphone : `http://192.168.1.42:8787`.

## QR code (optionnel)

Le backend peut afficher un QR au démarrage (Claude A — à confirmer) :

```
URL: http://192.168.1.42:8787
[QR]
```

## UX mobile

L'UI applique automatiquement le breakpoint `720px` :
- onglets horizontaux scrollables ;
- cartes Dashboard sur 2 colonnes (1 colonne <420px) ;
- formulaires en pleine largeur ;
- boutons hauteur min 44px (cible tactile iOS) ;
- vue logs réduite à 50vh, polices monospace plus petites.

## Recommandations

- N'active LAN que **temporairement** quand tu es loin du Mac.
- Coupe le LAN dès que tu n'en as plus besoin.
- Pose toujours un token bearer dans les settings backend si LAN activé.
- Ne lance jamais `auto-merge` ni `loop` depuis le téléphone sans avoir vu un run réussir en local d'abord.

Voir aussi : `docs/ops/local-control-security.md`.
