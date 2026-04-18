# Distribution signée privée de l’extension Thamous

Objectif :

- **ne pas publier** l’extension sur le catalogue public AMO ;
- obtenir une **signature Mozilla** ;
- permettre aux utilisateurs de Thamous d’installer l’extension depuis GitHub ;
- permettre ensuite des **mises à jour automatiques**.

## Modèle recommandé

1. **Signature AMO en mode unlisted**
2. dépôt du `.xpi` signé sur **GitHub Releases**
3. dépôt de `updates.json` sur une URL HTTPS stable, par exemple **GitHub Pages**

## Préparation locale

Depuis le dossier `firefox-extension-thamous/` :

```bash
python3 build_release.py --version 0.2.0
```

Cela génère dans `dist/` :

- `thamous-firefox-extension-0.2.0-source.zip`
- `thamous-firefox-extension-0.2.0.xpi`

Le `source.zip` sert de package prêt à signer.  
Le `.xpi` généré localement est un package unsigned pratique pour contrôle interne ; pour les utilisateurs finaux, il faut utiliser le `.xpi` **signé** par Mozilla.

## Préparation pour GitHub Pages / auto-update

Quand l’URL publique HTTPS est connue, par exemple :

```text
https://USER.github.io/REPO/firefox-extension-thamous
```

lancer :

```bash
python3 build_release.py \
  --version 0.2.0 \
  --base-url https://USER.github.io/REPO/firefox-extension-thamous
```

Cela ajoute dans le manifeste généré :

- `browser_specific_settings.gecko.update_url`

et génère aussi :

- `dist/updates.json`

## Signature unlisted sur AMO

1. créer / utiliser un compte développeur Mozilla
2. choisir le mode **unlisted**
3. téléverser `dist/thamous-firefox-extension-0.2.0-source.zip`
4. récupérer le `.xpi` signé fourni par Mozilla

## Publication GitHub

### GitHub Releases

Déposer dans une release :

- le `.xpi` signé Mozilla
- éventuellement le `source.zip`

### GitHub Pages

Publier :

- `updates.json`

à l’URL configurée par `--base-url`.

## Installation par les utilisateurs

### Première installation

- télécharger le `.xpi` signé depuis GitHub Releases
- l’ouvrir avec Firefox

### Mises à jour

Si `update_url` pointe vers un `updates.json` valide et que le `.xpi` signé est disponible à l’URL déclarée, Firefox pourra proposer les mises à jour.

## Rappels importants

- conserver le même `gecko.id`
- incrémenter `version` à chaque release
- regénérer `updates.json` à chaque nouvelle version
- publier le **`.xpi` signé**, pas le `.xpi` local unsigned
