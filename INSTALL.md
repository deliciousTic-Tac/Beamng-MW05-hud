# Installation et test

## Installation rapide

1. Copiez le dossier `ui/modules/apps/MW05VehicleHUD` dans `Documents\BeamNG.drive\<version>\ui\modules\apps`.
2. Lancez BeamNG.drive, ouvrez Freeroam puis `ESC` → `UI Apps`.
3. Ajoutez `MW05 Vehicle HUD`. L’app reste déplaçable et redimensionnable via l’éditeur de layout.
4. Ajoutez `MW05 Forced Induction` si le véhicule possède un turbo ou un compresseur. Elle reste déplaçable et redimensionnable de la même manière.

## Installation par mod ZIP

Depuis PowerShell :

```powershell
.\build.ps1
```

Placez ensuite `MW05BeamNG.zip` dans le dossier `mods` de l’utilisateur BeamNG. Le ZIP contient `ui/modules/apps/...`.

## Vérifications en jeu

- Vérifier 0, 50, 130 et 200+ km/h.
- Vérifier ralenti, mi-régime, rupteur, marche arrière, neutre et changements rapides.
- Vérifier un véhicule avec carburant, un véhicule électrique et un véhicule sans NOS.
- Vérifier un véhicule turbo/compresseur et un véhicule atmosphérique : la pression et l’app doivent rester masquées si `boost` n’est pas publié.

La température numérique et le NOS restent masqués si le véhicule ne publie pas une valeur correspondante dans `electrics`. C’est volontaire pour ne pas présenter une information inventée.
