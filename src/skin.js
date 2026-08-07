// ---------------------------------------------------------------------------
// Blockbench texture plumbing: reading skin pixels, writing them back through
// the undo system, and moving PNGs in and out of Alfalfa.
// ---------------------------------------------------------------------------

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

export function getAuxTexture(role) {
	if (!Project || !Project.textures) return null;
	return Project.textures.find((t) => t.ears_role === role) || null;
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
export function editTexture(texture, fn, undoName) {
	if (!texture) return false;
	if (isLayered(texture)) {
		Blockbench.showMessageBox({
			title: 'Ears: flatten layers first',
			message:
				'This texture has layers enabled. Ears data lives in specific pixels and in the ' +
				'alpha channel of large regions of the skin, so it has to be written to a flat ' +
				'image.\n\nUse Texture → Disable Texture Layers (which merges them down) and try again.',
			buttons: ['Flatten now', 'Cancel'],
			confirm: 0,
			cancel: 1,
		}, (result) => {
			if (result === 0 && BarItems.disable_texture_layers) BarItems.disable_texture_layers.trigger();
		});
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
	return texture;
}

export function removeAuxTexture(role) {
	const texture = getAuxTexture(role);
	if (texture) texture.remove(true);
}
