# Extension Firefox Thamous

Cette extension permet d'importer depuis Firefox :

1. la référence principale de la page active ;
2. toutes les références détectées dans la page ;
3. la page web elle-même comme référence de type `Site`.

Pour la référence principale, l'extension extrait dans Firefox les métadonnées principales de la page active (titre, auteur, langue, etc.), puis envoie l'URL de l'onglet actif à l'API v2 (`prepare_ref`, mode `from_url`). Elle ouvre ensuite la page Thamous de validation (`nouvelle_ref.php`) dans une nouvelle fenêtre, préremplie pour que l'utilisateur confirme l'enregistrement.

## Fichiers

- `manifest.json` : manifeste WebExtension.
- `icons/` : icônes embarquées, générées à partir de `BabouinPapyrus.png`.
- `background.js` : authentification, stockage du token, appel API, ouverture de la page de validation.
- `content-script.js` : extraction locale des métadonnées dans la page ouverte par Firefox.
- `popup.html` / `popup.css` / `popup.js` : interface de connexion et d'import.

## Flux d'authentification

L'extension appelle :

- `POST /thamous/php/api/v2/index.php?path=login_token`

avec un login et un mot de passe, puis stocke localement le token Bearer retourné.

## Flux d'import depuis l'onglet actif

L'extension appelle :

- `POST /thamous/php/api/v2/index.php?path=prepare_ref`

avec un JSON de la forme :

```json
{
  "mode": "from_url",
  "projet": "perso",
  "page_url": "https://...",
  "page_title": "Titre de l'onglet",
  "fields": {
    "nom": "Nom, Prénom",
    "titre": "Titre détecté",
    "langue": "français",
    "editeur": "Éditeur détecté",
    "annee": "2026",
    "doi": "10....",
    "url": "https://..."
  }
}
```

L'extension pré-extrait ces métadonnées dans Firefox, puis l'API complète si besoin et retourne `form_url`.

Le projet est volontairement fixé à `perso` dans l'extension afin de garder une interface minimale pour l'import rapide.

## Import de toutes les références

Le bouton **Importer toutes les références** ouvre la page Thamous existante `llm/import_biblio_llm.php` dans une nouvelle fenêtre, en lui transmettant l'URL de la page active.

Cette fenêtre :

- réutilise le workflow d'import bibliographique déjà présent dans Thamous ;
- lance automatiquement l'extraction ;
- distingue les références déjà présentes dans Thamous ;
- laisse l'utilisateur sélectionner celles qu'il souhaite importer.

## Import de la page

Le bouton **Importer la page** prépare une référence `Site` à partir de l'URL active, de son titre, de la langue détectée, de l'éditeur/site, et de l'année éventuelle.

## Chargement dans Firefox

1. ouvrir `about:debugging#/runtime/this-firefox`
2. cliquer sur **Charger un module complémentaire temporaire**
3. sélectionner `manifest.json` dans ce dossier

## Archive ZIP

Une archive ZIP de l'extension peut être générée pour faciliter le chargement ou l'archivage.

## Signature privée et distribution GitHub

L’extension est conçue pour pouvoir être :

- signée par Mozilla en mode **unlisted** ;
- distribuée ensuite hors AMO public, par exemple via **GitHub Releases** ;
- mise à jour via un `updates.json` auto-hébergé.

Voir :

- `DISTRIBUTION.md`
- `build_release.py`

## Limites actuelles

- l'extraction dépend des métadonnées présentes dans la page distante ;
- les `host_permissions` sont limitées à `https://thamous.ouvaton.org/*` ;
- les tailles d'icône sont générées localement à partir de `BabouinPapyrus.png`, avec centrage sur fond transparent.
