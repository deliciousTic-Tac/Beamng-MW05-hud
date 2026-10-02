# Installation and Testing

## Quick Installation

1. Copy the `ui/modules/apps/MW05VehicleHUD` folder into `Documents\BeamNG.drive\<version>\ui\modules\apps`.
2. Launch BeamNG.drive, open Freeroam, then select `ESC` → `UI Apps`.
3. Add `MW05 Vehicle HUD`. The app can be moved and resized in the layout editor.
4. Add `MW05 Forced Induction` if the vehicle has a turbocharger or supercharger. It can be moved and resized in the same way.

## Installing the Mod ZIP

From PowerShell:

```powershell
.\build.ps1
```

Then place `MW05BeamNG.zip` in the `mods` folder inside your BeamNG user folder. The ZIP contains `ui/modules/apps/...`.

## In-Game Checks

- Check the display at 0, 50, 130, and 200+ km/h.
- Check idle, mid-range RPM, the rev limiter, reverse, neutral, and rapid gear changes.
- Test a fuel-powered vehicle, an electric vehicle, and a vehicle without NOS.
- Test a turbocharged/supercharged vehicle and a naturally aspirated vehicle: the boost pressure display and the app must remain hidden if `boost` is not exposed.

The numeric temperature display and NOS remain hidden if the vehicle does not expose a corresponding value in `electrics`. This is intentional to avoid displaying fabricated data.
