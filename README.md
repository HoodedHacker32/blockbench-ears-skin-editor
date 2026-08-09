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
- **Import an existing Ears skin and it reads itself.** Choose "Import a PNG…" and if the skin already
  has magic pixels, the dialog detects them and fills every field in. Leave them alone and the original
  bytes are preserved untouched — no lossy re-encode of the quantised values.
- **Export as a single PNG.** `File → Export → Export Ears Skin` writes the one image you upload to
  Mojang, magic pixels and embedded wing/cape included.
- **A real skin editor, not a side panel.** The format reuses Blockbench's own skin machinery, so you
  get box UV, the layer cubes, painting, and the full **pose** system with its preset poses — natural,
  walking, crouching, sitting, jumping, aiming — plus custom poses. The Ears geometry is parented to the
  bones, so it moves with the pose.
- **Paint the ears in 3D.** The Ears geometry is built as real Blockbench mesh elements parented to the
  matching bones, so every paint tool works on it exactly as it does on the body — and you can select,
  hide, move and delete it like any other part.
- **Live 3D preview.** Change a setting, or paint the skin, and it updates immediately.
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

1. **New Model > Ears Skin**. Choose the player model, a texture, and a starting preset — or
   "Import a PNG…" to open an existing skin, whose Ears settings are read back automatically.
2. The project opens in paint mode with the **Ears** panel in the right sidebar.
3. Hit **Fill empty regions** to see where every enabled feature reads from, then paint over it.
4. Switch to **Pose** mode to check it from every angle.
5. **File > Export > Export Ears Skin** for the finished PNG.

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
- **Texture layers work — no flattening needed.** Ears data is written into two managed layers,
  **Ears Data** and **Ears Alfalfa**, which are kept at the top of the stack and put back there if you
  move them. Everything below is yours to paint normally. A **Flatten layers** button is still in the
  panel if you'd rather bake it down.
- **You can edit the magic pixels by hand.** Paint a valid value and it just shows up in the panel.
  Paint something Ears can't read and the change is reverted with a note saying which pixel was wrong
  and why — otherwise Ears would silently reinterpret it as "off" and the skin would quietly stop
  working in game.
- **Emissive** marks the palette in `(52,32)-(56,36)` as glowing. The preview renders those quads
  unlit rather than simulating the in-game bloom.
- **The Ears meshes are yours to break.** They're ordinary elements, so moving or deleting them is
  allowed and survives painting. They're only regenerated when you change an Ears *setting* — or when
  you press **Rebuild Ears geometry**, which is the way back after you've taken one apart.
- **Reopening a `.bbmodel` keeps the geometry you saved**, including hand edits, rather than silently
  regenerating it. Blockbench doesn't serialise plugin-set properties, so the plugin re-identifies its
  own meshes and textures by name on load — a narrow match, under a known bone, so meshes you made and
  named yourself are left alone.
- **Wings and capes are paintable too.** They aren't in the skin's atlas at all — they're whole PNG
  files hidden in its alpha channel — so they get their own texture and their own UV space, and the
  plugin adds them to the project automatically when a skin contains one. That hidden encoding is
  applied **only at export**, so the skin you're drawing on stays a normal skin and painting can't
  destroy an embedded wing.
- **Plain Minecraft Skin projects get the preview, not the meshes**, because that format doesn't allow
  mesh elements. To paint Ears geometry on an existing skin, make an Ears Skin project and choose
  "Import a PNG…" for the texture.

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
| `src/meshbuilder.js` | Builds the Ears quads as real, paintable Blockbench mesh elements |
| `src/layers.js` | Writes exact RGB and alpha through managed texture layers |
| `src/validate.js` | Checks hand-edited magic pixels are something Ears can read |
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

### Why the geometry is mesh elements

Blockbench's paint pipeline resolves a 3D click to `element.faces[face].uv` — it needs a real element
with real faces. A raw three.js overlay can't participate, which is why the ears used to be
look-but-don't-touch.

There's no cheating it by hitting an existing cube either: Ears deliberately samples the *gaps* in the
vanilla atlas. The "Above" ears read `(24,0)-(40,8)`, and on an 8x8x8 head at `(0,0)` the only faces in
`v 0-8` are top `(8-16)` and bottom `(16-24)` — so `u 24-32` is unused, and `u 32-40` is the matching
unused strip in the hat block. No cube face covers those pixels.

Details that bite:

- Mesh face UVs are in texture pixels, not normalised.
- Blockbench renders meshes `DoubleSide`, but Ears emits coincident front/back quad pairs that rely on
  backface culling. Left alone they z-fight, so the pair is straddled by ±0.01 into a paper-thin sheet.
- Wings and capes live in their own 20×16 image, not the 64×64 atlas, so the format sets
  `per_texture_uv_size: true` and gives each texture its own `uv_width`/`uv_height`.
- That in turn rules out `single_texture`, and **without it Blockbench only auto-binds "the one
  texture" while there genuinely is only one**. The moment a wing texture appears the body's cube faces
  go ambiguous and render untextured, so every cube face is bound to the skin texture explicitly on
  each refresh.

## How the wing gets inside the skin

Ears stores wing and cape images with a trick called Alfalfa. Vanilla's skin loader force-opaques
certain rectangles of the skin, which makes the alpha bits in those areas dead weight — so Ears uses
**7 bits of each pixel's alpha** (`a = (0x7F - v) | 0x80` writing, `v = 0x7F - (a & 0x7F)` reading,
the high bit keeping the pixel opaque). Chained together that's a ~1428 byte side channel.

Into it goes a small container: magic `0xEA1FA1FA`, a version byte, then length-prefixed key/value
entries. The value for `wing` is **the raw PNG file**, header and IDAT and all. So an Ears skin is an
ordinary PNG with a second PNG hidden inside its alpha channel.

The plugin decodes that into a real project texture and builds the wing geometry against it. Crucially
it does **not** keep the encoding in the texture you're editing: the payload is held separately and
applied to a copy only at export.

That matters for two reasons. The encoding drops the alpha of scattered pixels to between 50% and 100%,
so a skin carrying a wing looks faintly moth-eaten in the editor even though it renders solid in game
(Minecraft forces those regions opaque). And more seriously, painting anywhere in those regions would
overwrite the data and destroy the wing. Deferring to export means the skin you're drawing on is just a
normal skin, and the wing can't be damaged by editing.

Importing a skin that already has a wing works the same way round: the payload is lifted out of the
alpha, the working texture is cleaned up, and it all goes back in when you export.

### Getting exact bytes through texture layers

Ordinary `source-over` compositing can only ever *raise* alpha, so a top layer can't produce the
sub-255 values Alfalfa needs. Blockbench has a second mechanism though: an `alpha_mask` layer
**multiplies** the composite's alpha by its own red channel (see `Texture.updateLayerChanges`). Over an
opaque pixel that reproduces any target exactly — verified across the whole 0x80–0xFF range Alfalfa
uses, with no rounding error. Hence the two layers: `Ears Data` carries opaque RGB, `Ears Alfalfa`
carries the alpha.

The catch is that a mask multiplies rather than sets, so it only lands on target over an opaque base.
Writing over a skin whose base layer *already* held Alfalfa alpha of 183 would give 183×183/255 = 131
and silently corrupt the payload. Compensating arithmetically doesn't round-trip reliably, so any pixel
whose final alpha isn't 255 is forced opaque in the data layer first. That stays cheap because Alfalfa
writes 0xFF for every pixel past the end of its payload — only the payload itself is ever stamped, so
the rest of the skin keeps showing whatever you paint underneath.

Every write is verified against the resulting composite, and if it doesn't match (something painting
over the managed layers) you get told rather than shipping a broken skin.

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
