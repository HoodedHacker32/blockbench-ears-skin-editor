# Ears Skin Editor

A [Blockbench](https://blockbench.net) plugin for editing [Ears](https://ears.y2k.diy) skins with the
ears, tail, snout, horns, claws and wings shown as **real 3D geometry on the player model** — not just
coloured pixels you have to imagine.

The geometry is produced by Ears' own renderer. The plugin bundles `ears-common.js`, the TeaVM build of
the Ears mod's `common` module — the same build the official web manipulator runs on — so the preview is
the mod's actual output rather than a reimplementation that drifts.

## What it does

- **Its own model format.** "Ears Skin" appears on the start screen next to Minecraft Skin, with a
  setup dialog: pick wide or slim, pick a texture, and configure the Ears features up front — including
  starting presets (Fox, Cat, Bunny, Wolf, Deer, Floppy-eared, Winged) that fill the rest of the form in.
- **A real skin editor, not a side panel.** The format reuses Blockbench's own skin machinery, so you
  get box UV, the layer cubes, painting, and the full **pose** system with its preset poses — natural,
  walking, crouching, sitting, jumping, aiming — plus custom poses. The Ears geometry is parented to the
  bones, so it moves with the pose.
- **Live 3D preview.** Every Ears feature is built as quads and parented to the matching bone. Change a
  setting, or paint the skin, and it updates immediately.
- **Tells you where to paint.** Turning on a feature gives you geometry with nothing drawn on it, which
  is the single most confusing thing about Ears. The panel lists the exact texture regions your current
  config reads — derived from the real quad UVs, not a hardcoded table — and "Fill empty regions" paints
  a distinct checkered placeholder into each one so every feature becomes visible at once. Paint over it.
- **Full magic-pixel editor.** Ear mode and anchor, claws, horn, tail mode / segments / per-segment
  bend angles, snout width-height-length-offset, chest size, wing mode, wing animation, cape flag and
  the emissive palette.
- **Reads and writes both formats.** v0 ("Pixelwise") and v1 ("Binary"). It keeps whatever format the
  skin already uses, and defaults to v0 for new skins so they round-trip byte-identically with the
  official web manipulator.
- **Alfalfa wing and cape textures.** The wing/cape PNGs that Ears hides in the alpha channel of the
  skin's forced-opaque regions can be imported, exported, removed — or added to the project as a normal
  texture so you can paint them with Blockbench's own tools and have the skin re-encoded as you go.
- **Proper undo.** Every change goes through Blockbench's undo stack.

## Install

**From a URL** (works on desktop and [web.blockbench.net](https://web.blockbench.net)):

`File > Plugins > Load Plugin from URL`, then paste:

```
https://raw.githubusercontent.com/HoodedHacker32/blockbench-ears-skin-editor/main/dist/ears_skin_editor.js
```

**From a file:** download `dist/ears_skin_editor.js` and use `File > Plugins > Load Plugin from File`.

Requires Blockbench 4.10 or newer. Developed and tested against 5.1.6.

## Using it

1. **New Model > Ears Skin**. Choose the player model, a texture, and a starting preset.
2. The project opens in paint mode with the **Ears** panel in the right sidebar.
3. Hit **Fill empty regions** to see where every enabled feature reads from, then paint over it.
4. Switch to **Pose** mode to check it from every angle.

The panel also works on ordinary **Minecraft Skin** projects, so existing skins can be opened and
edited without converting anything.

Either way, the settings live in the 4x4 block of pixels at `x 0-3, y 32-35` in the skin — that block
*is* the configuration, which is why changes have to be saved into the skin and uploaded to Mojang for
anything to show up in game. There is no config file.

### A few things worth knowing

- **Draw your own artwork.** Ears reads the shapes from unused regions of the skin — turning on "Above"
  ears gives you a 16x8 quad textured from `(24,0)`, and if those pixels are empty you'll see nothing.
  The "Texture regions" section of the panel tells you every rect in use, and can fill them for you.
- **Wings need a wing image.** Setting a wing mode without importing a 20x16 wing PNG does nothing;
  Ears itself disables wings in that case. The panel warns you.
- **Flatten texture layers first.** Ears data lives in specific pixels and in the alpha channel of large
  regions, so it has to be written to a flat image. If layers are enabled the plugin offers to flatten.
- **Emissive** marks the palette in `(52,32)-(56,36)` as glowing. The preview renders those quads
  unlit rather than simulating the in-game bloom.

## Building

```bash
npm install
npm run build
```

Output is `dist/ears_skin_editor.js` (~363 KB, most of which is the vendored `ears-common.js`).

`npm run install-local` builds and copies it straight into your local Blockbench plugins folder.

### Tests

```bash
node test/serve.mjs
```

then open <http://localhost:8177/test/harness.html>. It runs the codecs and the ears-common bridge in a
real browser and checks, among other things, that the v0 writer emits the exact pixel values the
official manipulator does, and that a wing PNG survives the alpha-channel round trip byte for byte.

### Layout

| Path | What it is |
| --- | --- |
| `src/codec.js` | v1 "Binary" magic-pixel reader/writer, plus the bit streams it needs |
| `src/codec-v0.js` | v0 "Pixelwise" magic-pixel reader/writer |
| `src/bridge.js` | Drives the vendored `ears-common.js` and keeps it out of `window` |
| `src/renderer.js` | Turns Ears' quad list into three.js meshes on Blockbench's bones |
| `src/format.js` | The "Ears Skin" model format and its setup dialog |
| `src/presets.js` | Player model definitions and the starting feature presets |
| `src/regions.js` | Derives which texture pixels the current config reads |
| `src/skin.js` | Texture reads/writes through the undo system; PNG to canvas and back |
| `src/index.js` | Plugin registration, panel UI, event wiring |

### How the format reuses Blockbench

Rather than reimplementing the skin editor, the format leans on two things:

- `pose_mode: true` is the whole of the posing feature. The pose Mode gates on `Format.pose_mode` and
  the Skin Pose panel gates on the mode, so posing and its presets come along for free.
- `Codecs.skin_model.parse()` builds the bones, cubes, box UVs, layer cubes and the UV template texture
  exactly as the built-in format does.

The only patching is widening five built-in toolbar actions that hardcode `formats: ['skin']`
(`toggle_skin_layer`, `convert_minecraft_skin_variant`, `explode_skin_model`, `custom_skin_poses`,
`add_custom_skin_pose`). Those are restored on unload.

## How the preview is positioned

Ears' `anchorTo(part)` puts the origin at a body part cuboid's `(minX, maxY, minZ)` in Minecraft
ModelPart space, where **+Y points down**. Blockbench stores cubes with **+Y up**, and builds the skin
model **mirrored on X** (the bone named "Right Arm" sits at +X here, but at -X in Minecraft). So the
mapping onto a Blockbench bone is:

| Ears | Blockbench |
| --- | --- |
| origin | `(cube.to.x, cube.from.y, cube.from.z)` |
| +X | -X (mirrored; detected from the model, not assumed) |
| +Y | -Y |
| +Z | +Z (the player's back) |

Cross-checks that pin this down: `EarMode.ABOVE` translates `(-4,-16,0)` and draws a 16x8 quad, which
lands at Blockbench y 32-40 — exactly on top of a head that ends at y 32. `EarAnchor.CENTER` translates
`(0,0,4)` from a head starting at z=-4, landing on the head's centre plane.

## Credits

[Ears](https://ears.y2k.diy) is by **Exa Skye** and contributors, MIT licensed.
Source: <https://git.sleeping.town/exa.mods/Ears> - Mirror: <https://github.com/exaskye/Ears>

`vendor/ears-common.js` is an unmodified build of that project — see [`vendor/NOTICE.md`](vendor/NOTICE.md).
This plugin is not affiliated with or endorsed by the Ears project.

## Licence

MIT. See [LICENSE](LICENSE).
