# Changelog

## 0.2.0 — 2026-11-15

### Powertrain

- Fix the Percheron 8x8 rangebox: switching between High and Low works in both directions.
- Keep the front output shaft dial in sync with the vehicle's controller and keyboard shortcuts. Remove the duplicate transfercase dial for that output.
- Harmonize front, rear and center differential icons in both Powertrain apps.
- Make the simplified 2H / 4H / 4Lo selector more compact and reduce the space between the dials and differential buttons.

### Gauges

- Follow the game's speed, pressure and oil temperature units automatically.
- Click KM/H or MPH to change the speed unit.
- Hide the forced induction gauge when no turbo or supercharger is detected.
- Change the NOS gauge color with its state: gray when disarmed, orange when armed and blue while injecting.
- Fix NOS level detection so the activation signal is not mistaken for bottle level.
- Fix zero positions for the oil pressure, oil temperature and battery voltage needles.
- Clear old readings when changing vehicles.
- Keep filters and gradients separate when several copies of the same gauge are displayed.

### Reliability and optimization

- Reduce unnecessary updates and repeated calculations. Stop scheduled work when an app is removed.
- Limit simultaneous Lua requests, expire unanswered requests and space out retries. Ignore late replies and replies from a previous vehicle.
- Avoid accumulating entries in BeamNG's Lua callback registry.
- Safely quote device names containing special characters in Lua commands.
- Add a shared runtime, a reproducible package builder and regression tests for the gauges and powertrain controls.
- Keep development files, tests and presentation images out of the installable ZIP.

AFR, oil pressure and battery voltage fallback calculations are unchanged. When a vehicle does not expose measured values, these apps may still display estimates.

Validation: local regression checks, generated Lua execution and simultaneous SVG instance checks. This release was not given a new full in-game verification.

## 0.1.0 — 2026-10-02

- Initial GitHub release with the MW05 UI apps.
