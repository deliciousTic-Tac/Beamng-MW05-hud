# MW05 BeamNG UI Apps

Une app BeamNG.drive inspirée de la référence visuelle fournie :

- `MW05 Vehicle HUD` : compte-tours vectoriel, vitesse KM/H, rapport, indicateurs de carburant/batterie, température et NOS uniquement lorsque la donnée réelle existe.
- `MW05 Forced Induction` : cadran de pression turbo/compresseur, aiguille réactive et affichage décimal en PSI ou en bar (cliquer sur l’unité) lorsque le véhicule publie `boost` et `boostMax`.
- `MW05 Oil Pressure` : même cadran pour la pression d’huile, avec affichage décimal en PSI ou en bar lorsque le véhicule publie une valeur de pression d’huile.
- `MW05 Minimap` : application indépendante qui reprend le moteur natif de la minimap BeamNG pour la carte, les routes, la position et l’orientation du véhicule, avec un habillage circulaire sombre et un anneau segmenté.
- `MW05 Powertrain Dial` : commande compacte au style MW05 avec molette 2H / 4H / 4Lo, sélecteurs Hi/Lo et Open/Lock lorsque le véhicule les expose, ainsi que les boutons natifs de différentiel et d’essieu moteur adaptés à l’habillage sombre et orange.

## Données utilisées

Le HUD s’abonne au stream BeamNG `electrics` et utilise `wheelspeed`, `rpmTacho`, `gear`, `gearIndex`, `fuel` et `oil`. Les valeurs optionnelles sont découvertes dans l’objet reçu sans jamais afficher une jauge NOS, batterie ou température numérique fictive. L’app Forced Induction utilise `boost` et `boostMax`, exprimés en PSI par BeamNG. L’app Oil Pressure accepte `oilPressure` en bar ainsi que les variantes explicites publiées par certains véhicules ou mods.

## Développement

Le dossier est copiable tel quel dans `<Userfolder>\ui\modules\apps`. Le script `build.ps1` produit aussi un ZIP de mod avec des chemins internes en `/`.

Le mini aperçu statique `preview.html` sert à vérifier la composition visuelle sans lancer le jeu ; il ne remplace pas le test en jeu des streams et événements BeamNG. La minimap délègue volontairement son rendu au backend natif du jeu afin de conserver son positionnement exact.
