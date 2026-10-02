# Analyse d'utilisation du code — MW05BeamNG

Date de l'analyse : 2026-08-18

## Périmètre

Revue statique de tous les fichiers présents dans `MW05BeamNG`, avec recherche des références entre le code JavaScript, le CSS, les aperçus, la configuration et le script de build. Le nettoyage décrit ci-dessous a ensuite été appliqué.

## Fichiers sans référence détectée

Les fichiers suivants ne sont référencés par aucun autre fichier du projet :

| Fichier | Constat |
| --- | --- |
| `ui/modules/apps/MW05VehicleHUD/assets/fuel.svg` | L'icône est dessinée directement en SVG dans `app.js` et dans l'aperçu autonome. |
| `ui/modules/apps/MW05VehicleHUD/assets/hud.svg` | Le cadran est dessiné directement dans les templates SVG. |
| `ui/modules/apps/MW05VehicleHUD/assets/nitrous.svg` | La représentation NOS est dessinée directement dans les templates SVG. |
| `ui/modules/apps/MW05VehicleHUD/assets/temperature.svg` | L'icône de température est dessinée directement dans `app.js` et dans l'aperçu autonome. |
| `lua/ge/extensions/` | Répertoire vide ; aucun fichier Lua n'est présent. |

`ui/modules/apps/MW05VehicleHUD/preview.html` n'est pas inclus dans le ZIP par `build.ps1` et n'est référencé par aucun autre fichier. Il a été conservé comme aperçu HTML autonome utilisable manuellement.

## Éléments conservés comme utilisés

- `app.js`, `app.css` et `app.json` sont les fichiers des applications BeamNG ;
- `MW05VehicleHUD` utilise le stream `electrics` avec les données moteur, température, carburant, NOS et indicateurs ;
- `MW05ForcedInduction` utilise le stream `electrics` avec `boost` et `boostMax` ;
- `build.ps1` est référencé par `INSTALL.md` et construit le ZIP ;
- le `preview.html` à la racine utilise `ui/modules/apps/MW05VehicleHUD/app.png` ;
- `ui/modules/apps/MW05VehicleHUD/preview.html` reste un aperçu autonome, même s'il n'est pas utilisé par le build.

## Nettoyage appliqué

Supprimés du dossier actif :

- les quatre SVG autonomes non référencés (`fuel.svg`, `hud.svg`, `nitrous.svg`, `temperature.svg`) ;
- les deux archives de travail (`MW05BeamNG.zip` imbriqué et `MW05BeamNG_old.zip`) ;
- le répertoire `lua/ge/extensions/`, qui était vide ;
- les blocs JavaScript et CSS commentés qui ne correspondaient plus à aucun binding.

Le ZIP de sortie à la racine du workspace est régénéré par `build.ps1` et reste l'artefact installé dans BeamNG. Le script exclut les fichiers de documentation, d'analyse, de build et d'aperçu : l'archive contient uniquement les trois applications actives sous `ui/modules/apps/`.

## Vérifications

- Aucun dépôt Git n'est présent dans le répertoire ; aucun changement préalable n'a donc pu être comparé à un historique.
- Aucun runtime JavaScript/outil de lint n'est installé dans l'environnement disponible.
- La vérification effectuée est statique : recherche de références, inspection des bindings Angular et contrôle de la liste des fichiers.

## Optimisations complémentaires — 18/08/2026

- suppression du bloc `<style>` dupliqué dans le template du HUD ; le style chargé par `app.css` est désormais la seule source utilisée en jeu ;
- suppression des styles inline redondants sur les conteneurs SVG ;
- suppression de la règle CSS du remplissage turbo qui n'est plus rendu ;
- suppression de `tick.value`, `display.hasBoost` et `display.maxBoost`, qui n'étaient consommés par aucun template ;
- conservation volontaire des styles historiques utilisés par `ui/modules/apps/MW05VehicleHUD/preview.html`, afin de ne pas casser l'aperçu autonome ;
- conservation volontaire d'un `app.png` dans chaque application, car BeamNG recherche l'icône dans le dossier propre à chaque application ; l'icône native Navigation est également utilisée par `MW05Minimap`.
- ajout de `MW05Minimap`, qui ne recalcule pas la projection monde-écran en JavaScript : il transmet au renderer natif `ui_apps_minimap_minimap` le rectangle réel de l'application.
- validation statique étendue aux trois applications et aux appels natifs de la minimap.

## Limite

L'utilisation éventuelle de fichiers par BeamNG ou par un autre outil externe au répertoire ne peut pas être prouvée par une analyse statique locale. Les fichiers marqués sans référence sont donc des candidats inutilisés dans ce projet, pas une preuve qu'ils sont inutilisés dans tout l'environnement BeamNG.
