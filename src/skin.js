// ---------------------------------------------------------------------------
// Blockbench texture plumbing: reading skin pixels, writing them back through
// the undo system, and moving PNGs in and out of Alfalfa.
// ---------------------------------------------------------------------------

import * as Layers from './layers.js';

export const WING_TEXTURE_NAME = 'ears_wing';
export const CAPE_TEXTURE_NAME = 'ears_cape';

/** The project texture that holds the actual skin (64x64). */
export function getSkinTexture() {
	if (!Project || !Project.textures) return null;
	const candidates = Project.textures.filter(
		(t) => !t.ears_role && t.width === 64 && t.height === 64
	);
	if (!candidates.length) return null;
	// Prefer whatever the user has selected, else the first.
	return candidates.find((t) => t.selected) || candidates[0];
}

const AUX_DISPLAY_NAMES = { [WING_TEXTURE_NAME]: 'Ears Wing', [CAPE_TEXTURE_NAME]: 'Ears Cape' };

/**
 * Custom properties like `ears_role` don't survive a .bbmodel round trip -- only
 * Blockbench's own known fields are serialised. So fall back to matching on the
 * name and re-tag, otherwise reopening a project would add a duplicate wing
 * texture every time.
 */
export function getAuxTexture(role) {
	if (!Project || !Project.textures) return null;
	const tagged = Project.textures.find((t) => t.ears_role === role);
	if (tagged) return tagged;

	const named = Project.textures.find((t) => t.name === AUX_DISPLAY_NAMES[role] && !t.ears_role);
	if (named) {
		named.ears_role = role;
		return named;
	}
	return null;
}

/** Alfalfa.ENCODE_REGIONS -- the areas whose alpha can carry wing/cape data. */
export const ENCODE_REGIONS = [
	[8, 0, 24, 8],
	[0, 8, 8, 16],
	[16, 8, 32, 16],
	[4, 16, 12, 20],
	[20, 16, 36, 20],
	[44, 16, 52, 20],
	[0, 20, 56, 32],
	[20, 48, 28, 52],
	[36, 48, 44, 52],
	[16, 52, 48, 64],
];

/**
 * Undo Alfalfa's alpha encoding so the working texture looks like a normal skin.
 *
 * Ears never stores a data pixel below 50% opacity (the high bit is always set),
 * and the game forces these regions opaque anyway -- so anything at 128..254 is
 * payload, and its "real" appearance is fully opaque. Genuinely transparent
 * pixels are left alone.
 */
export function stripAlfalfaAlpha(imageData) {
	let cleaned = 0;
	for (const [x1, y1, x2, y2] of ENCODE_REGIONS) {
		for (let y = y1; y < y2; y++) {
			for (let x = x1; x < x2; x++) {
				const i = (y * imageData.width + x) * 4 + 3;
				const a = imageData.data[i];
				if (a >= 128 && a !== 255) {
					imageData.data[i] = 255;
					cleaned++;
				}
			}
		}
	}
	return cleaned;
}

/** True if any pixel is drawn. A texture restored from a project file reports its
 *  size immediately but paints its bitmap asynchronously, so this is how we tell
 *  "genuinely blank" from "not decoded yet". */
export function hasAnyPixels(imageData) {
	if (!imageData) return false;
	const d = imageData.data;
	for (let i = 3; i < d.length; i += 4) {
		if (d[i] !== 0) return true;
	}
	return false;
}

/** True if a texture has layers turned on, which blocks in-place pixel writes. */
export function isLayered(texture) {
	return !!(texture && texture.layers_enabled && texture.layers && texture.layers.length);
}

export function readImageData(texture) {
	if (!texture || !texture.ctx) return null;
	try {
		return texture.ctx.getImageData(0, 0, texture.width, texture.height);
	} catch (e) {
		console.error('[Ears] could not read texture pixels', e);
		return null;
	}
}

/**
 * Mutate a texture's pixels through Blockbench's undo system.
 * `fn` receives an ImageData it may modify in place.
 */
/**
 * Flatten a texture's layers into its own bitmap.
 *
 * Blockbench's own "Disable Texture Layers" action works on `Texture.selected`,
 * so it silently does nothing when some other texture (the wing, say) is
 * selected -- which is why flattening only worked sometimes. This targets the
 * texture explicitly.
 */
export function flattenTexture(texture) {
	if (!texture || !isLayered(texture)) return false;
	// Composite the layers down into the texture's own canvas and source first,
	// otherwise emptying the layer list would throw the artwork away.
	texture.updateLayerChanges(true);

	Undo.initEdit({ textures: [texture], bitmap: true });
	texture.layers_enabled = false;
	texture.selected_layer = null;
	texture.layers.empty();
	texture.updateChangesAfterEdit();
	Undo.finishEdit('Flatten texture for Ears data');

	if (typeof UVEditor !== 'undefined' && UVEditor.vue) UVEditor.vue.layer = null;
	if (typeof updateInterfacePanels === 'function') updateInterfacePanels();
	if (typeof BARS !== 'undefined' && BARS.updateConditions) BARS.updateConditions();
	return true;
}

export function editTexture(texture, fn, undoName) {
	if (!texture) return false;

	// Layered textures are written through two managed layers rather than being
	// flattened -- see layers.js. Verification is built in, so if the composite
	// doesn't come out exactly right we fall back to offering a flatten.
	if (isLayered(texture)) {
		Undo.initEdit({ textures: [texture], bitmap: true });
		const { ok, mismatches } = Layers.writeThroughLayers(texture, fn);
		Undo.finishEdit(undoName);
		if (ok) return true;

		Blockbench.showMessageBox(
			{
				title: 'Ears: layers are covering the data',
				message:
					`The Ears data couldn't be written through "${texture.name}"'s layers — ${mismatches} ` +
					'pixel(s) came out wrong, which usually means a layer above "Ears Data" / ' +
					'"Ears Alfalfa" is painting over them.\n\n' +
					'Move those layers back to the top, or flatten the texture.',
				buttons: ['Flatten now', 'Cancel'],
				confirm: 0,
				cancel: 1,
			},
			(result) => {
				if (result === 0 && flattenTexture(texture)) {
					Blockbench.showQuickMessage('Layers flattened — try that again', 2500);
				}
			}
		);
		return false;
	}

	const imageData = readImageData(texture);
	if (!imageData) return false;

	Undo.initEdit({ textures: [texture], bitmap: true });
	fn(imageData);
	texture.ctx.putImageData(imageData, 0, 0);
	texture.updateChangesAfterEdit();
	Undo.finishEdit(undoName);
	return true;
}

/** A detached 64x64 canvas holding a copy of the texture, for use as a THREE map. */
export function cloneToCanvas(texture, existing) {
	if (!texture) return null;
	const canvas = existing || document.createElement('canvas');
	canvas.width = texture.width;
	canvas.height = texture.height;
	const ctx = canvas.getContext('2d');
	ctx.imageSmoothingEnabled = false;
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.drawImage(texture.canvas || texture.img, 0, 0);
	return canvas;
}

export function imageDataToCanvas(imageData, existing) {
	const canvas = existing || document.createElement('canvas');
	canvas.width = imageData.width;
	canvas.height = imageData.height;
	canvas.getContext('2d').putImageData(imageData, 0, 0);
	return canvas;
}

// --- PNG <-> canvas -------------------------------------------------------

export function decodePng(bytes) {
	return new Promise((resolve, reject) => {
		if (!bytes || !bytes.length) return resolve(null);
		const blob = new Blob([bytes], { type: 'image/png' });
		const url = URL.createObjectURL(blob);
		const img = new Image();
		img.onload = () => {
			const canvas = document.createElement('canvas');
			canvas.width = img.naturalWidth;
			canvas.height = img.naturalHeight;
			const ctx = canvas.getContext('2d');
			ctx.imageSmoothingEnabled = false;
			ctx.drawImage(img, 0, 0);
			URL.revokeObjectURL(url);
			resolve(canvas);
		};
		img.onerror = (e) => {
			URL.revokeObjectURL(url);
			reject(e);
		};
		img.src = url;
	});
}

export function encodePng(canvas) {
	return new Promise((resolve, reject) => {
		canvas.toBlob((blob) => {
			if (!blob) return reject(new Error('toBlob returned null'));
			blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)), reject);
		}, 'image/png');
	});
}

/**
 * Add (or refresh) a project texture holding a wing/cape image, so it can be
 * painted with Blockbench's normal tools.
 */
export async function upsertAuxTexture(role, canvas, displayName) {
	let texture = getAuxTexture(role);
	const dataUrl = canvas.toDataURL('image/png');

	if (!texture) {
		texture = new Texture({ name: displayName, id: role }).fromDataURL(dataUrl).add(false);
		texture.ears_role = role;
	} else {
		texture.fromDataURL(dataUrl);
	}
	// The wing/cape are their own little images, not part of the 64x64 atlas, so
	// their UV space has to match their own resolution. Requires
	// Format.per_texture_uv_size.
	texture.uv_width = canvas.width;
	texture.uv_height = canvas.height;
	return texture;
}

export function removeAuxTexture(role) {
	const texture = getAuxTexture(role);
	if (texture) texture.remove(true);
}

/**
 * Point every cube face at the skin texture.
 *
 * The format can't be single_texture -- the wing and cape need their own UV
 * space -- and without that, Blockbench only falls back to "the one texture" while
 * there genuinely is only one. The moment a wing texture appears the body's faces
 * become ambiguous and render untextured, so they have to be bound explicitly.
 *
 * Cheap and idempotent, so it runs on every refresh and self-heals.
 */
export function bindCubesToSkin(texture) {
	if (!texture || typeof Cube === 'undefined') return 0;
	let changed = 0;
	for (const cube of Cube.all) {
		if (!cube.faces) continue;
		for (const key in cube.faces) {
			const face = cube.faces[key];
			if (face && face.texture !== texture.uuid) {
				face.texture = texture.uuid;
				changed++;
			}
		}
	}
	if (changed && typeof Canvas !== 'undefined' && Canvas.updateAllFaces) Canvas.updateAllFaces();
	return changed;
}
