# Vendored dependency

## ears-common.js

`ears-common.js` is the TeaVM-compiled build of the `common` module of the **Ears** Minecraft mod. It is
included unmodified.

- **Project:** Ears — "Faithful fancy fashion features for fuzzy folk."
- **Author:** Exa Skye and contributors
- **Copyright:** © 2020–2026 Exa Skye and contributors
- **Licence:** MIT
- **Source:** <https://git.sleeping.town/exa.mods/Ears>
- **Mirror:** <https://github.com/exaskye/Ears>
- **Version:** 1.4.7 (reports `commonVersion === "1.4.7"`)
- **Obtained from:** <https://ears.y2k.diy/manipulator/ears-common.js>
- **SHA-256:** see `ears-common.js.sha256`

In the Ears repository this file is a symlink to `common/build/teavm/classes.min.js`, so it only exists
after building the `common` module. To rebuild it yourself:

```bash
git clone https://git.sleeping.town/exa.mods/Ears
cd Ears/common
./gradlew clean build closure
# -> common/build/teavm/classes.min.js
```

### What this plugin uses it for

It exposes two functions on `window`:

- `rebuildQuads()` — reads a 64×64 canvas with `id="skin"`, parses the Ears magic pixels and Alfalfa
  data, runs the mod's real renderer, and writes a flat list of quads (each with a transform stack and
  precomputed UVs) to `window.renderObjects`.
- `encodeAlfalfa()` — takes `window.alfalfaData` and encodes it into the skin's alpha channel.

The plugin's `src/bridge.js` supplies those DOM dependencies temporarily and removes the globals
afterwards, so nothing is left on `window`.

### MIT License

Copyright (c) 2020-2026 Exa Skye and contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
