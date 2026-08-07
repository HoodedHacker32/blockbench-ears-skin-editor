# Ears Skin Editor

A [Blockbench](https://blockbench.net) plugin for editing [Ears](https://ears.y2k.diy) skins with the
ears, tail, snout, horns, claws and wings shown as **real 3D geometry on the player model** — not just
coloured pixels you have to imagine.

The geometry is produced by Ears' own renderer. The plugin bundles `ears-common.js`, the TeaVM build of
the Ears mod's `common` module — the same build the official web manipulator runs on — so the preview is
the mod's actual output rather than a reimplementation that drifts.

## What it does

- **Live 3D preview.** Every Ears feature is built as quads and parented to the matching bone, so it
  follows posing and animation. Change a setting, or paint the skin, and it updates immediately.
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

1. Open or create a **Minecraft Skin** project (64x64).
2. Open the **Ears** panel in the right sidebar.
3. Tick **Ears enabled** and start setting things.

The panel writes into the 4x4 block of pixels at `x 0-3, y 32-35` in the skin — that block *is* the
configuration, which is why the changes have to be saved into the skin and uploaded to Mojang for
anything to show up in game. There is no config file.

### A few things worth knowing

- **Draw your own artwork.** Ears reads the shapes from unused regions of the skin — turning on "Above"
  ears gives you a 16x8 quad textured from `(24,0)`, and if those pixels are empty you'll see nothing.
  The plugin shows you exactly where the geometry sits so you know which pixels to paint.
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
| `src/skin.js` | Texture reads/writes through the undo system; PNG to canvas and back |
| `src/index.js` | Plugin registration, panel UI, event wiring |

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
