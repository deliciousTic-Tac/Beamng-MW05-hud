# Installation and Testing

## Installation

1. Download `MW05BeamNG.zip` from the [latest GitHub release](https://github.com/deliciousTic-Tac/MW05Beamng/releases/latest).
2. Place the ZIP directly in `beamng\current\mods`, the `mods` folder inside your active BeamNG user folder. Do not extract it.

```text
beamng\current\mods\MW05BeamNG.zip
```

To locate your active user folder, use the BeamNG launcher: `Manage User Folder` → `Open in Explorer`, then open `mods`. Create the `mods` folder if it does not exist.

The ZIP contains all 10 MW05 applications and their resources under `ui/modules/apps/`.

## Using the Apps

1. Launch BeamNG.drive and open Freeroam.
2. Select `ESC` → `UI Apps` and add the MW05 apps you want to use.
3. Move and resize the apps in the layout editor. Vehicle-dependent gauges and controls are available when the vehicle exposes the corresponding data or functions.

## In-Game Checks

- Check the display at 0, 50, 130, and 200+ km/h.
- Check idle, mid-range RPM, the rev limiter, reverse, neutral, and rapid gear changes.
- Test a fuel-powered vehicle, an electric vehicle, and a vehicle without NOS.
- Test a turbocharged/supercharged vehicle and a naturally aspirated vehicle: the boost pressure display and the app must remain hidden if `boost` is not exposed.

The numeric temperature display and NOS remain hidden if the vehicle does not expose a corresponding value in `electrics`. This is intentional to avoid displaying fabricated data.
