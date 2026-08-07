// ---------------------------------------------------------------------------
// Works out which texture pixels the current Ears configuration actually reads.
//
// This isn't a hardcoded table. Every quad ears-common emits carries the UVs it
// samples (already normalised against whichever texture is bound), so the set of
// regions in use falls straight out of the render output -- which means it stays
// correct for any feature combination, and for features added to Ears later.
//
// The point of it: turning on a feature gives you geometry with nothing drawn on
// it. Knowing exactly where to paint is most of the work.
// ---------------------------------------------------------------------------

const TEXTURE_SIZES = {
	skin: [64, 64],
	emissive_skin: [64, 64],
	wing: [20, 16],
	emissive_wing: [20, 16],
	cape: [20, 16],
};

/**
 * Collapse the quad list into deduplicated pixel rects per texture.
 * Returns [{ texture, x, y, w, h }], sorted for stable display.
 */
export function computeRegions(objects) {
	const seen = new Map();
	for (const o of objects || []) {
		if (o.type !== 'quad' || !o.uvs) continue;
		const size = TEXTURE_SIZES[o.texture];
		if (!size) continue;

		let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
		for (const [u, v] of o.uvs) {
			if (u < minU) minU = u;
			if (u > maxU) maxU = u;
			if (v < minV) minV = v;
			if (v > maxV) maxV = v;
		}
		const x = Math.round(minU * size[0]);
		const y = Math.round(minV * size[1]);
		const w = Math.round((maxU - minU) * size[0]);
		const h = Math.round((maxV - minV) * size[1]);
		if (w <= 0 || h <= 0) continue;

		const key = `${o.texture}:${x},${y},${w},${h}`;
		if (!seen.has(key)) seen.set(key, { texture: o.texture, x, y, w, h });
	}
	return [...seen.values()].sort(
		(a, b) => a.texture.localeCompare(b.texture) || a.y - b.y || a.x - b.x
	);
}

/** How many pixels in a region are fully transparent, i.e. not drawn yet. */
export function countEmpty(imageData, region) {
	let empty = 0;
	for (let y = region.y; y < region.y + region.h; y++) {
		for (let x = region.x; x < region.x + region.w; x++) {
			if (x < 0 || y < 0 || x >= imageData.width || y >= imageData.height) continue;
			if (imageData.data[(y * imageData.width + x) * 4 + 3] === 0) empty++;
		}
	}
	return empty;
}

export function summarise(regions, imageData) {
	const skin = regions.filter((r) => r.texture === 'skin');
	let total = 0;
	let empty = 0;
	for (const r of skin) {
		total += r.w * r.h;
		if (imageData) empty += countEmpty(imageData, r);
	}
	return { count: skin.length, total, empty };
}

/**
 * Paint a flat placeholder into every fully-transparent pixel of the skin
 * regions, so the geometry becomes visible and can be painted over.
 * Distinct hue per region makes it obvious which quad is which in 3D.
 */
export function fillEmptyRegions(imageData, regions, { onlyEmpty = true } = {}) {
	const skin = regions.filter((r) => r.texture === 'skin');
	let painted = 0;
	skin.forEach((region, index) => {
		const hue = (index * 47) % 360;
		const [r, g, b] = hslToRgb(hue / 360, 0.6, 0.55);
		for (let y = region.y; y < region.y + region.h; y++) {
			for (let x = region.x; x < region.x + region.w; x++) {
				if (x < 0 || y < 0 || x >= imageData.width || y >= imageData.height) continue;
				const i = (y * imageData.width + x) * 4;
				if (onlyEmpty && imageData.data[i + 3] !== 0) continue;
				// Slight checker so the pixel grid stays readable while painting.
				const shade = (x + y) % 2 === 0 ? 1 : 0.88;
				imageData.data[i] = Math.round(r * shade);
				imageData.data[i + 1] = Math.round(g * shade);
				imageData.data[i + 2] = Math.round(b * shade);
				imageData.data[i + 3] = 255;
				painted++;
			}
		}
	});
	return painted;
}

function hslToRgb(h, s, l) {
	const f = (n) => {
		const k = (n + h * 12) % 12;
		const a = s * Math.min(l, 1 - l);
		return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
	};
	return [f(0), f(8), f(4)];
}
