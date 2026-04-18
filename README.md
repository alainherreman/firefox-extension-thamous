# Extension Firefox Thamous

Cette extension permet d’ajouter plus facilement des références dans **Thamous** depuis Firefox.

## À quoi sert-elle ?

Quand vous consultez une page web, l’extension peut :

- **importer la référence principale** de la page ;
- **importer toutes les références** repérées dans la page ;
- **importer la page elle-même** comme référence web.

Elle évite ainsi de recopier à la main le titre, l’auteur, l’année, la langue, etc.

## Installation

### Installer l’extension signée

1. téléchargez le fichier **`.xpi` signé** depuis la page GitHub du projet, dans le dossier `signed/` ;
2. dans Firefox, ouvrez `about:addons` ;
3. cliquez sur la roue dentée ;
4. choisissez **Installer un module depuis un fichier…** ;
5. sélectionnez le fichier `.xpi`.

Une fois installée, vous pouvez l’épingler dans la barre d’outils Firefox.

Téléchargement direct du fichier signé :

- `signed/thamous-firefox-extension-0.2.0-signed.xpi`

## Première utilisation

1. cliquez sur l’icône de l’extension ;
2. connectez-vous avec vos identifiants **Thamous** ;
3. choisissez l’action souhaitée :
   - **la référence principale**
   - **toutes les références**
   - **la page**

## Choix du modèle LLM

Pour l’option **toutes les références**, un modèle LLM doit être sélectionné dans Thamous.

Si aucun modèle n’est sélectionné :

- l’extension vous l’indique ;
- vous pouvez cliquer sur le nom du modèle (ou sur le bouton proposé) pour ouvrir la fenêtre de sélection.

## Pour les utilisateurs de Thamous

L’extension est prévue pour un usage avec **Thamous** et ouvre ensuite la fenêtre de validation habituelle afin de vérifier ou compléter les informations avant l’enregistrement.

## Remarques

- selon les sites, les métadonnées récupérées peuvent être plus ou moins complètes ;
- certaines pages donnent d’excellents résultats, d’autres demandent encore une petite correction manuelle ;
- l’extension est surtout faite pour **gagner du temps**, pas pour remplacer toute vérification.

## Distribution

Cette extension est distribuée de manière privée sous forme d’extension Firefox signée, en dehors du catalogue public AMO.
