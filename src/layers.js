// ---------------------------------------------------------------------------
// Writing Ears data into a layered texture, without flattening.
//
// Ears needs exact RGB in the magic block and exact ALPHA across the Alfalfa
// regions, which ordinary source-over compositing can't give you -- a top layer
// can only raise alpha, never lower it. But Blockbench has a second mechanism:
// an `alpha_mask` layer MULTIPLIES the composite's alpha by its own red channel
// (see Texture.updateLayerChanges). Over an opaque base that reproduces any
// target alpha exactly, verified across the full 0x80-0xFF range Alfalfa uses.
//
// So two managed layers, kept at the top of the stack:
//
//   "Ears Data"     normal blend  -- opaque RGB for pixels we must control
//   "Ears Alfalfa"  alpha_mask    -- red channel = the alpha each pixel needs
//
// The data layer deliberately stamps as little as possible: only pixels whose
// RGB actually has to change, or which have to be forced opaque for the mask to
// bite. Everything else stays on the user's own layers, so painting still works
// normally underneath.
// ---------------------------------------------------------------------------

export const DATA_LAYER = 'Ears Data';
export const MASK_LAYER = 'Ears Alfalfa';

/**
 * Every pixel whose exact value we have to control while editing.
 *
 * Only the 4x4 magic block. Alfalfa is no longer written into the working
 * texture at all -- it's applied to a copy at export time -- so the alpha of the
 * encode regions is the artist's to do as they like.
 */
function controlledMask(width, height) {
	const set = new Uint8Array(width * height);
	for (let y = 32; y < 36; y++) {
		for (let x = 0; x < 4; x++) set[y * width + x] = 1;
	}
	return set;
}

export function findLayer(texture, name) {
	return (texture.layers || []).find((l) => l.name === name) || null;
}

function ensureLayer(texture, name, blendMode) {
	let layer = findLayer(texture, name);
	if (!layer) {
		layer = new TextureLayer({ name, offset: [0, 0] }, texture);
		layer.setSize(texture.width, texture.height);
		texture.layers.push(layer);
	}
	if (layer.width !== texture.width || layer.height !== texture.height) {
		layer.setSize(texture.width, texture.height);
	}
	layer.blend_mode = blendMode;
	layer.visible = true;
	layer.opacity = 100;
	return layer;
}

/** Our layers only work if nothing sits above them. Re-assert that. */
export function raiseManagedLayers(texture) {
	if (!texture || !texture.layers) return false;
	const data = findLayer(texture, DATA_LAYER);
	const mask = findLayer(texture, MASK_LAYER);
	if (!data && !mask) return false;

	let moved = false;
	for (const layer of [data, mask]) {
		if (!layer) continue;
		const at = texture.layers.indexOf(layer);
		if (at !== -1) texture.layers.splice(at, 1);
		texture.layers.push(layer);
		if (at !== texture.layers.length - 1) moved = true;
	}
	return moved;
}

/** Composite as it would be without our two layers. */
function readBaseComposite(texture) {
	const data = findLayer(texture, DATA_LAYER);
	const mask = findLayer(texture, MASK_LAYER);
	const states = [];
	for (const layer of [data, mask]) {
		if (!layer) continue;
		states.push([layer, layer.visible]);
		layer.visible = false;
	}
	texture.updateLayerChanges(false);
	const base = texture.ctx.getImageData(0, 0, texture.width, texture.height);
	for (const [layer, visible] of states) layer.visible = visible;
	return base;
}

/**
 * Apply `mutate` (which edits a full-size ImageData) to a layered texture by
 * expressing the result through the two managed layers.
 *
 * @returns {{ok: boolean, mismatches: number}}
 */
export function writeThroughLayers(texture, mutate) {
	const width = texture.width;
	const height = texture.height;

	// Two different composites are needed, and confusing them loses data:
	//   `full` is what the texture currently looks like, INCLUDING Ears data
	//         already written into our layers -- this is what the edit applies to.
	//   `base` is what it looks like WITHOUT our layers, and is only used to
	//         decide which pixels we actually have to stamp.
	// Starting the edit from `base` would silently discard every previous Ears
	// write, because those live in the very layers `base` excludes.
	const full = texture.ctx.getImageData(0, 0, width, height);
	const base = readBaseComposite(texture);
	texture.updateLayerChanges(false); // restore the full composite after peeking

	const desired = new ImageData(new Uint8ClampedArray(full.data), width, height);
	mutate(desired);

	const controlled = controlledMask(width, height);
	const data = ensureLayer(texture, DATA_LAYER, 'default');
	const mask = ensureLayer(texture, MASK_LAYER, 'alpha_mask');
	raiseManagedLayers(texture);

	const dataImg = data.ctx.createImageData(width, height);
	const maskImg = mask.ctx.createImageData(width, height);

	for (let i = 0; i < controlled.length; i++) {
		const p = i * 4;
		// The mask governs alpha everywhere; 255 means "leave it alone".
		maskImg.data[p] = controlled[i] ? desired.data[p + 3] : 255;
		maskImg.data[p + 1] = 0;
		maskImg.data[p + 2] = 0;
		maskImg.data[p + 3] = 255;

		if (!controlled[i]) continue;

		const rgbDiffers =
			desired.data[p] !== base.data[p] ||
			desired.data[p + 1] !== base.data[p + 1] ||
			desired.data[p + 2] !== base.data[p + 2];

		// The mask MULTIPLIES alpha rather than setting it, so it only lands on
		// the target exactly when the pixel underneath is fully opaque. Over a
		// base that already carries Alfalfa alpha (183, say) a mask of 183 would
		// give 183*183/255 = 131 and quietly corrupt the payload. Compensating
		// arithmetically doesn't round-trip reliably, so any pixel whose final
		// alpha isn't 255 gets forced opaque in the data layer first.
		//
		// This is cheap in practice: Alfalfa writes 0xFF for every pixel past the
		// end of its payload, so only the payload itself is ever stamped.
		const needsOpaqueBase = desired.data[p + 3] !== 255 && base.data[p + 3] !== 255;

		if (rgbDiffers || needsOpaqueBase) {
			dataImg.data[p] = desired.data[p];
			dataImg.data[p + 1] = desired.data[p + 1];
			dataImg.data[p + 2] = desired.data[p + 2];
			dataImg.data[p + 3] = 255;
		}
	}

	data.ctx.clearRect(0, 0, width, height);
	data.ctx.putImageData(dataImg, 0, 0);
	mask.ctx.clearRect(0, 0, width, height);
	mask.ctx.putImageData(maskImg, 0, 0);

	texture.updateLayerChanges(true);

	// Trust nothing: confirm the composite really says what we intended.
	const result = texture.ctx.getImageData(0, 0, width, height);
	let mismatches = 0;
	for (let i = 0; i < controlled.length; i++) {
		if (!controlled[i]) continue;
		const p = i * 4;
		if (result.data[p + 3] !== desired.data[p + 3]) {
			mismatches++;
			continue;
		}
		// RGB is irrelevant once a pixel is fully transparent.
		if (desired.data[p + 3] === 0) continue;
		if (
			result.data[p] !== desired.data[p] ||
			result.data[p + 1] !== desired.data[p + 1] ||
			result.data[p + 2] !== desired.data[p + 2]
		) {
			mismatches++;
		}
	}
	return { ok: mismatches === 0, mismatches };
}

/** Drop the managed layers, e.g. when Ears data is removed entirely. */
export function removeManagedLayers(texture) {
	if (!texture || !texture.layers) return;
	for (const name of [DATA_LAYER, MASK_LAYER]) {
		const layer = findLayer(texture, name);
		if (layer) texture.layers.remove(layer);
	}
	texture.updateLayerChanges(true);
}
