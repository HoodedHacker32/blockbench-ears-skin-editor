# Ears for Bedrock (approximation)

A Bedrock addon that renders Ears-style ears, tail and snout on players, drawn from the
same unused regions of the 64×64 skin that the [Ears](https://ears.y2k.diy) Java mod uses.

**This is not a port of Ears, and it can't be one.** Read the next section before using it.

> **You probably want the skin pack export instead.** The Blockbench plugin can package Ears skins as
> a Bedrock `.mcpack` with the geometry baked in per skin, which needs no world addon, travels with
> the player, and keeps each skin's own configuration. See `File > Export > Export Ears Skin Pack`.
> This addon is only useful when you want one fixed look applied to everyone in a world.

## What Bedrock can and can't do

Ears works by reading the player's skin PNG at runtime — "magic pixels" for the configuration,
and the alpha channel for embedded wing/cape PNGs. **No part of a Bedrock addon can read pixels.**

- Resource packs are declarative JSON. Molang can query entity state (`query.property`,
  `query.variant`, …) but has no texture-sampling function.
- The Script API (`@minecraft/server`) is gameplay only; it cannot touch textures or rendering.
- There is no moddable shader stage.

So the magic pixels are unreadable, and Alfalfa — a whole PNG hidden in the alpha channel — is
completely out of reach.

What *does* carry over is the artwork. Ears reads its shapes from unused regions of the standard
skin atlas, and a resource pack can add geometry whose UVs point at those same regions, textured
with the player's own skin. So:

| | Java (Ears) | Here |
| --- | --- | --- |
| Artwork | your skin | your skin — same regions |
| Which features are on | read from magic pixels | chosen in-game, or fixed in the pack |
| Wings / capes | PNG in the alpha channel | not possible |
| Per-feature detail (bend angles, snout size) | encoded per skin | fixed |

If a player hasn't painted those regions, the geometry samples transparent pixels and simply
doesn't show — so the pack is harmless for players who aren't using it.

**Persona skins can't participate at all.** Character Creator skins have no editable 64×64 atlas.

## Supported features

| Feature | Values |
| --- | --- |
| Ears | none, above, sides |
| Tail | none, down, back, up (single segment, with a gentle sway) |
| Snout | off, on (4×2×2 at offset 1) |

Ears' other modes (tall, cross, floppy, around, behind), multi-segment tail bends, claws, horn,
chest and emissive aren't implemented yet. The geometry file is laid out so they slot in as extra
bones plus a line each in the animation.

## Building the packs

Two files have to come from **your** game version rather than from this repo: Minecraft's own
`player.entity.json` and `player.json`. They're long, version-specific, and carry every animation
and gameplay component the player has — shipping a guessed copy would break far more than it
fixed. Grab them from [Mojang/bedrock-samples](https://github.com/Mojang/bedrock-samples) and patch
them:

```bash
# Resource pack: swap in the Ears geometry + feature animation.
# Fixed for everyone (ears=above, tail=down, snout=off):
node patch_player_entity.mjs path/to/bedrock-samples/resource_pack/entity/player.entity.json ears=1,tail=1,snout=0

# ...or driven per player by the behaviour pack:
node patch_player_entity.mjs path/to/bedrock-samples/resource_pack/entity/player.entity.json properties

# Behaviour pack (only needed for the per-player version):
node patch_player_behaviour.mjs path/to/bedrock-samples/behavior_pack/entities/player.json
```

Then copy `ears_rp` into `development_resource_packs` and `ears_bp` into
`development_behavior_packs`, and enable both on the world. The behaviour pack needs the
**Beta APIs** experiment for the script module.

In game: `/scriptevent ears:config` opens the settings form.

Values: ears `0` none / `1` above / `2` sides · tail `0` none / `1` down / `2` back / `3` up ·
snout `0` off / `1` on.

## How the geometry was derived

Ears' `anchorTo(part)` puts the origin at a body part cuboid's `(minX, maxY, minZ)` in Minecraft
ModelPart space, where **+Y points down**. Bedrock geometry uses the same X/Z convention with +Y up,
so the mapping onto a bone is: origin `(cube.minX, cube.bottomY, cube.minZ)`, and Ears' +Y becomes −Y.

Checked against the real renderer and verified by loading the geometry in Blockbench:

| Bone | Bedrock box | Why that's right |
| --- | --- | --- |
| `ears_above` | x −8..8, y 32..40, z 0 | head ends at y 32; the quad is 16 wide and centred |
| `snout` | x −2..2, y 25..27, z −6..−4 | head front is z −4, so it protrudes forward |
| `tail` | y 3.6..14, z 2..8 | hangs from the torso bottom, swinging **backward** |

That last one caught a real error: the tail's rotation sign was inverted and it swung forward
through the body. Bedrock's positive X bone rotation matches Ears' positive tail angle.

## Known limitations

- **The back faces are approximate.** Ears textures the back of each quad from a separate,
  90°-rotated region. Bedrock's per-face UV can mirror but not rotate, so both faces use the front
  region.
- **The snout's sides and top** are single stretched faces; Ears tiles 1px strips along the depth.
- **Not yet tested in game.** The geometry and placement are verified in Blockbench against the
  Java implementation, but nothing here has been loaded into Bedrock. Treat the manifest
  `min_engine_version` and the `@minecraft/server` dependency versions as starting points.
