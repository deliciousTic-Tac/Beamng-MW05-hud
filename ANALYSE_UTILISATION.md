# Code Usage Analysis — MW05BeamNG

Analysis date: 2026-08-18

This is a historical report. Packaging and repository setup have since changed; see [INSTALL.md](INSTALL.md) for current installation instructions. The current release contains all 10 MW05 applications and their resources.

## Scope

Static review of all files in `MW05BeamNG`, checking references between the JavaScript code, CSS, previews, configuration, and packaging workflow. The cleanup described below was then applied.

## Files with No Detected References

The following files are not referenced by any other file in the project:

| File | Finding |
| --- | --- |
| `ui/modules/apps/MW05VehicleHUD/assets/fuel.svg` | The icon is drawn directly as SVG in `app.js` and in the standalone preview. |
| `ui/modules/apps/MW05VehicleHUD/assets/hud.svg` | The dial is drawn directly in the SVG templates. |
| `ui/modules/apps/MW05VehicleHUD/assets/nitrous.svg` | The NOS graphic is drawn directly in the SVG templates. |
| `ui/modules/apps/MW05VehicleHUD/assets/temperature.svg` | The temperature icon is drawn directly in `app.js` and in the standalone preview. |
| `lua/ge/extensions/` | Empty directory; no Lua files are present. |

`ui/modules/apps/MW05VehicleHUD/preview.html` is not included in the mod ZIP and is not referenced by any other file. It was retained as a standalone HTML preview that can be opened manually.

## Retained Items in Use

- `app.js`, `app.css`, and `app.json` are the BeamNG application files;
- `MW05VehicleHUD` uses the `electrics` stream for engine, temperature, fuel, NOS, and indicator data;
- `MW05ForcedInduction` uses the `electrics` stream with `boost` and `boostMax`;
- the packaging workflow assembled the mod ZIP;
- the root `preview.html` uses `ui/modules/apps/MW05VehicleHUD/app.png`;
- `ui/modules/apps/MW05VehicleHUD/preview.html` remains a standalone preview, even though it is not used by the build.

## Cleanup Applied

Removed from the active folder:

- the four unreferenced standalone SVGs (`fuel.svg`, `hud.svg`, `nitrous.svg`, `temperature.svg`);
- the two working archives (the nested `MW05BeamNG.zip` and `MW05BeamNG_old.zip`);
- the empty `lua/ge/extensions/` directory;
- commented-out JavaScript and CSS blocks that no longer corresponded to any binding.

At the time of this analysis, the output ZIP at the workspace root was the artifact installed in BeamNG. Packaging excluded documentation, analysis, build, and preview files: the archive contained only the three applications active at that time under `ui/modules/apps/`.

## Checks

- No Git repository was present in the directory, so previous changes could not be compared against a history.
- No JavaScript runtime or linting tool was installed in the available environment.
- The checks performed are static: searching for references, inspecting Angular bindings, and reviewing the file list.

## Additional Optimizations — August 18, 2026

- removed the duplicate `<style>` block from the HUD template; the styles loaded by `app.css` are now the only source used in-game;
- removed redundant inline styles from SVG containers;
- removed the CSS rule for the boost fill, which is no longer rendered;
- removed `tick.value`, `display.hasBoost`, and `display.maxBoost`, which were not used by any template;
- deliberately retained the legacy styles used by `ui/modules/apps/MW05VehicleHUD/preview.html` to avoid breaking the standalone preview;
- deliberately retained an `app.png` in each application, since BeamNG looks for the icon in each application's own folder; the native Navigation icon is also used by `MW05Minimap`.
- added `MW05Minimap`, which does not recalculate the world-to-screen projection in JavaScript: it passes the application's actual rectangle to the native `ui_apps_minimap_minimap` renderer.
- extended static validation to the three applications and the minimap's native calls.

## Limitation

Potential use of files by BeamNG or by another tool outside the directory cannot be proven through local static analysis. Files marked as unreferenced are therefore potentially unused in this project; this does not prove that they are unused throughout the BeamNG environment.
