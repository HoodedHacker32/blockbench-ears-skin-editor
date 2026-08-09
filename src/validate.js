// ---------------------------------------------------------------------------
// Sanity-checks hand-edited magic pixels.
//
// The magic pixels are just pixels, so they can be painted over like anything
// else -- deliberately, or by accident with a fill tool. A valid edit should
// simply show up in the panel; an invalid one is almost always a mistake, and
// silently reinterpreting it (Ears falls back to "off" for anything it doesn't
// recognise) would quietly change someone's skin behind their back.
//
// Bias: when in doubt, ACCEPT. A false positive reverts an edit the user meant,
// which is far worse than letting an odd value through -- Ears itself is
// tolerant, and its own parser clamps rather than rejects.
// ---------------------------------------------------------------------------

import { detectFormat, Enums } from './codec.js';
import { MAGIC_PIXELS } from './codec-v0.js';

const MAGIC_BLUE = MAGIC_PIXELS.blue;
const BY_RGB = new Map(Object.entries(MAGIC_PIXELS).map(([name, rgb]) => [rgb, name]));

/** Colours the official manipulator can put in each slot. */
const ALLOWED_COLOURS = {
	1: { label: 'ear mode', colours: ['red', 'blue', 'green', 'purple2', 'cyan', 'orange', 'pink', 'white', 'gray', 'purple'] },
	2: { label: 'ear anchor', colours: ['blue', 'green', 'red'] },
	3: { label: 'protrusions', colours: ['blue', 'red', 'green', 'purple', 'cyan'] },
	4: { label: 'tail mode', colours: ['red', 'blue', 'green', 'purple', 'orange', 'pink', 'purple2', 'white', 'gray'] },
	8: { label: 'wing mode', colours: ['blue', 'red', 'pink', 'green', 'cyan', 'orange', 'purple', 'purple2'] },
	9: { label: 'wing animation', colours: ['blue', 'red'] },
	10: { label: 'emissive', colours: ['blue', 'orange'] },
};

/** Numeric slots: [label, [maxR, maxG, maxB]]. Magic Blue is also legal here --
 *  the parser treats it as "pretend it's black" for backwards compatibility. */
const NUMERIC_SLOTS = {
	6: { label: 'snout', max: [7, 4, 8] },
	7: { label: 'chest / snout offset / cape', max: [128, 7, 16] },
};

function pixelAt(imageData, idx) {
	const x = idx % 4;
	const y = 32 + Math.floor(idx / 4);
	const i = (y * imageData.width + x) * 4;
	const d = imageData.data;
	return { r: d[i], g: d[i + 1], b: d[i + 2], a: d[i + 3], rgb: (d[i] << 16) | (d[i + 1] << 8) | d[i + 2] };
}

/** Extract the 4x4 magic block as a flat RGBA copy. */
export function snapshotBlock(imageData) {
	const out = new Uint8Array(16 * 4);
	let p = 0;
	for (let y = 32; y < 36; y++) {
		for (let x = 0; x < 4; x++) {
			const i = (y * imageData.width + x) * 4;
			out[p++] = imageData.data[i];
			out[p++] = imageData.data[i + 1];
			out[p++] = imageData.data[i + 2];
			out[p++] = imageData.data[i + 3];
		}
	}
	return out;
}

export function restoreBlock(imageData, snapshot) {
	let p = 0;
	for (let y = 32; y < 36; y++) {
		for (let x = 0; x < 4; x++) {
			const i = (y * imageData.width + x) * 4;
			imageData.data[i] = snapshot[p++];
			imageData.data[i + 1] = snapshot[p++];
			imageData.data[i + 2] = snapshot[p++];
			imageData.data[i + 3] = snapshot[p++];
		}
	}
	return imageData;
}

export function blocksEqual(a, b) {
	if (!a || !b || a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
}

/**
 * @returns {{ok: boolean, problems: string[]}}
 */
export function validate(imageData) {
	const version = detectFormat(imageData);
	// No marker at all means Ears is simply off -- a perfectly valid thing to do.
	if (version === 'none') return { ok: true, problems: [] };
	return version === 'v1' ? validateV1(imageData) : validateV0(imageData);
}

function validateV0(imageData) {
	const problems = [];

	for (const [idx, { label, colours }] of Object.entries(ALLOWED_COLOURS)) {
		const px = pixelAt(imageData, Number(idx));
		const name = BY_RGB.get(px.rgb);
		if (!name) {
			problems.push(`the ${label} pixel is #${hex(px)}, which isn't one of the Ears magic colours`);
		} else if (!colours.includes(name)) {
			problems.push(`the ${label} pixel is Magic ${cap(name)}, which isn't a valid ${label}`);
		}
	}

	for (const [idx, { label, max }] of Object.entries(NUMERIC_SLOTS)) {
		const px = pixelAt(imageData, Number(idx));
		if (px.rgb === MAGIC_BLUE) continue; // legacy "treat as zero"
		const channels = [px.r, px.g, px.b];
		for (let c = 0; c < 3; c++) {
			if (channels[c] > max[c]) {
				problems.push(`the ${label} pixel has ${'RGB'[c]}=${channels[c]}, above the maximum of ${max[c]}`);
				break;
			}
		}
	}

	// The cape flag is a single bit; anything else in that channel isn't ours.
	const etc = pixelAt(imageData, 7);
	if (etc.rgb !== MAGIC_BLUE && etc.b !== 0 && etc.b !== 16) {
		problems.push(`the cape flag is ${etc.b}, but only 0 or 16 mean anything`);
	}

	return { ok: problems.length === 0, problems };
}

function validateV1(imageData) {
	const problems = [];
	const bytes = [];
	for (let y = 0; y < 4; y++) {
		for (let x = 0; x < 4; x++) {
			if (x === 0 && y === 0) continue;
			const i = ((32 + y) * imageData.width + x) * 4;
			bytes.push(imageData.data[i], imageData.data[i + 1], imageData.data[i + 2]);
		}
	}

	// Walk just far enough to check the enum ordinals actually name something.
	let bit = 8; // skip the version byte
	const read = (n) => {
		let v = 0;
		for (let i = 0; i < n; i++) {
			const byte = bytes[(bit / 8) | 0] || 0;
			v = (v << 1) | ((byte >> (7 - (bit % 8))) & 1);
			bit++;
		}
		return v;
	};

	// Field order follows EarsFeaturesParserV1.parse exactly; we only care whether
	// the enum values name something real.
	const ears = read(6);
	if (ears > 0) {
		const mode = Math.floor((ears - 1) / 3) + 1;
		if (mode >= Enums.EAR_MODES.length) {
			problems.push(`the ear mode value is ${mode}, but only 0-${Enums.EAR_MODES.length - 1} exist`);
		}
	}
	read(1); // claws
	read(1); // horn

	const tail = read(3);
	if (tail >= Enums.TAIL_MODES.length) {
		problems.push(`the tail mode value is ${tail}, but only 0-${Enums.TAIL_MODES.length - 1} exist`);
	}
	if (tail !== 0) {
		const segments = read(2) + 1;
		read(7); // bend 0 (sign + 6 bits)
		for (let i = 1; i < segments; i++) read(7);
	}

	if (read(3) > 0) {
		read(2); // snout height
		read(3); // snout depth
		read(3); // snout offset
	}
	read(5); // chest size

	const wing = read(3);
	if (wing >= Enums.WING_MODES.length) {
		problems.push(`the wing mode value is ${wing}, but only 0-${Enums.WING_MODES.length - 1} exist`);
	}

	return { ok: problems.length === 0, problems };
}

const hex = (px) => [px.r, px.g, px.b].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase();
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
