LES PEUPLIERS — WIDGET DYNAMIQUE FINAL

CONTENU À ENVOYER SUR GITHUB
--------------------------------
index.html
fond-final.png
assets/

IMPORTANT
--------------------------------
Le dossier assets doit rester exactement à côté de index.html.
Ne renommez aucun fichier ni aucun sous-dossier.

Le fond fond-final.png est le fond original de l'école.
Le ciel est isolé par assets/sky-mask.png afin de permettre les changements
jour / aube / lever / journée / coucher / crépuscule / nuit sans remplacer le fond.

Les arbres saisonniers et les phases lunaires sont des ressources locales.
Aucune image météo/lune/saison n'est chargée depuis un site externe.

DONNÉES MÉTÉO
--------------------------------
Les données météo réelles sont récupérées en ligne depuis Open-Meteo.
Une connexion Internet est donc nécessaire pour les données météo.
En cas d'indisponibilité temporaire, la dernière donnée météo valide est conservée
si elle existe dans le stockage local du navigateur.

GITHUB PAGES
--------------------------------
La racine du dépôt doit contenir directement index.html et fond-final.png.
Le dossier assets doit être au même niveau.

PI-SIGNAGE
--------------------------------
Les deux boîtiers peuvent afficher la même URL GitHub Pages.
Le widget utilise l'heure locale du navigateur/Raspberry Pi pour l'horloge et la date.

VERSION
--------------------------------
Version finale dynamique — 01/09/2026
