# MW05 BeamNG UI Apps

This project was created using artificial intelligence (AI), under human direction.

BeamNG.drive UI apps inspired by the provided visual reference:

- `MW05 Vehicle HUD`: vector tachometer, speed in KM/H, gear indicator, fuel/battery indicators, temperature, and NOS, shown only when real data is available.
- `MW05 Forced Induction`: turbo/supercharger boost gauge with a responsive needle and a decimal readout in PSI or bar (click the unit to switch), available when the vehicle exposes `boost` and `boostMax`.
- `MW05 Oil Pressure`: the same gauge design for oil pressure, with a decimal readout in PSI or bar when the vehicle exposes an oil pressure value.
- `MW05 Oil Temperature`: engine oil temperature gauge with Celsius/Fahrenheit display.
- `MW05 Battery Voltage`: battery voltage gauge with a decimal readout.
- `MW05 AFR`: digital air-fuel ratio display.
- `MW05 Ignition`: animated ignition key driven by the vehicle's ignition state.
- `MW05 Minimap`: a standalone app that uses BeamNG's native minimap engine for the map, roads, vehicle position, and orientation, with a dark circular design and a segmented ring.
- `MW05 Powertrain`: powertrain controls with functions that depend on the vehicle.
- `MW05 Powertrain Dial`: compact MW05-style controls with a 2H / 4H / 4Lo dial, Hi/Lo and Open/Lock selectors when the vehicle exposes them, and native differential and driven-axle buttons adapted to the dark and orange design.

## Installation

Download `MW05BeamNG.zip` from the [latest release](https://github.com/deliciousTic-Tac/MW05Beamng/releases/latest) and place it in `beamng\current\mods`, the `mods` folder inside your active BeamNG user folder. Keep the ZIP intact; do not extract it.

Launch BeamNG.drive, open Freeroam, then select `ESC` → `UI Apps` to add the MW05 apps. See [INSTALL.md](INSTALL.md) for details.

## Data Sources

The HUD subscribes to BeamNG's `electrics` stream and uses `wheelspeed`, `rpmTacho`, `gear`, `gearIndex`, `fuel`, and `oil`. Optional values are detected in the received object; NOS, battery, and numeric temperature displays never show fabricated data. The Forced Induction app uses `boost` and `boostMax`, which BeamNG reports in PSI. The Oil Pressure app accepts `oilPressure` in bar, as well as explicit variants exposed by certain vehicles or mods.

## Development

The application sources are under `ui/modules/apps/`. Release ZIPs preserve this directory structure at the archive root, with `/` path separators.

The small static `preview.html` preview lets you check the visual layout without launching the game; it does not replace in-game testing of BeamNG streams and events. The minimap delegates rendering to the game's native backend to maintain accurate positioning.
