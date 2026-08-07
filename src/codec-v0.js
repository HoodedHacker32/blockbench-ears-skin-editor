// ---------------------------------------------------------------------------
// Ears magic-pixel codec (format v0, "Pixelwise")
//
// Port of common/src/main/java/com/unascribed/ears/common/EarsFeaturesParserV0.java
// for reading, and of the web Manipulator's pixel writers for writing, so that
// skins round-trip byte-identically with the official tool.
//
// v0 stores one setting per pixel in the 4x4 block at x 0..3, y 32..35, indexed
// as x = idx % 4, y = 32 + floor(idx / 4):
//
//   0  magic (Magic Blue)      6  snout       R=width G=height B=depth
//   1  ear mode                7  etc         R=chest*128 G=snoutOffset B&16=cape
//   2  ear anchor              8  wing mode
//   3  protrusions             9  wing animation (Magic Red = off)
//   4  tail mode              10  emissive (Magic Orange = on)
//   5  tail bend  A=bend0 (inverted) R=bend1 G=bend2 B=bend3
// ---------------------------------------------------------------------------

import { defaultFeatures } from './codec.js';

export const MAGIC_PIXELS = {
	blue: 0x3f23d8,
	green: 0x23d848,
	red: 0xd82350,
	purple: 0xb923d8,
	cyan: 0x23d8c6,
	orange: 0xd87823,
	pink: 0xd823b7,
	purple2: 0xd823ff,
	white: 0xfefdf2,
	gray: 0x5e605a,
};

const BY_RGB = new Map(Object.entries(MAGIC_PIXELS).map(([name, rgb]) => [rgb, name]));

// Exactly the option->colour mappings the official Manipulator uses.
const EAR_MODE = { red: 'NONE', blue: 'ABOVE', green: 'SIDES', purple2: 'OUT', cyan: 'AROUND', orange: 'FLOPPY', pink: 'CROSS', white: 'TALL', gray: 'TALL_CROSS', purple: 'BEHIND' };
const EAR_ANCHOR = { blue: 'CENTER', green: 'FRONT', red: 'BACK' };
const PROTRUSIONS = { blue: [false, false], red: [false, false], green: [true, false], purple: [false, true], cyan: [true, true] };
const TAIL_MODE = { red: 'NONE', blue: 'DOWN', green: 'BACK', purple: 'UP', orange: 'VERTICAL', pink: 'CROSS', purple2: 'CROSS_OVERLAP', white: 'STAR', gray: 'STAR_OVERLAP' };
const WING_MODE = { blue: 'NONE', red: 'NONE', pink: 'SYMMETRIC_DUAL', green: 'SYMMETRIC_SINGLE', cyan: 'ASYMMETRIC_L', orange: 'ASYMMETRIC_R', purple: 'ASYMMETRIC_DUAL', purple2: 'FLAT' };

const invert = (map, preferred) => {
	const out = {};
	for (const [colour, value] of Object.entries(map)) {
		if (out[value] === undefined || (preferred && preferred[value] === colour)) out[value] = colour;
	}
	return out;
};
// NONE appears twice in a couple of maps; pin the colour the Manipulator emits.
const EAR_MODE_TO_COLOUR = invert(EAR_MODE, { NONE: 'red' });
const EAR_ANCHOR_TO_COLOUR = invert(EAR_ANCHOR);
const TAIL_MODE_TO_COLOUR = invert(TAIL_MODE, { NONE: 'red' });
const WING_MODE_TO_COLOUR = invert(WING_MODE, { NONE: 'red' });

function pixelIndexToXY(idx) {
	return [idx % 4, 32 + Math.floor(idx / 4)];
}

function getPixel(imageData, idx) {
	const [x, y] = pixelIndexToXY(idx);
	const i = (y * imageData.width + x) * 4;
	const d = imageData.data;
	return { a: d[i + 3], r: d[i], g: d[i + 1], b: d[i + 2], rgb: (d[i] << 16) | (d[i + 1] << 8) | d[i + 2] };
}

function setPixel(imageData, idx, r, g, b, a = 255) {
	const [x, y] = pixelIndexToXY(idx);
	const i = (y * imageData.width + x) * 4;
	const d = imageData.data;
	d[i] = r;
	d[i + 1] = g;
	d[i + 2] = b;
	d[i + 3] = a;
}

function setMagic(imageData, idx, colourName) {
	const rgb = MAGIC_PIXELS[colourName];
	setPixel(imageData, idx, (rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff, 255);
}

function magicName(imageData, idx) {
	return BY_RGB.get(getPixel(imageData, idx).rgb) || null;
}

/**
 * Pixel value -> unit in [-1, 1], with an encoding that reserves 0 for exactly
 * zero so that a black pixel means "no bend".
 */
function pxValToUnit(i) {
	if (i === 0) return 0;
	let j = i - 128;
	if (j < 0) j -= 1;
	if (j >= 0) j += 1;
	return j / 128;
}

/** Inverse of pxValToUnit, matching the Manipulator's encodeDegrees(). */
function degreesToPxVal(deg, allowZero) {
	if (deg === 0 && allowZero) return 0;
	let val = Math.round((deg / 90) * 128);
	if (val < 0) val++;
	if (val > 0) val--;
	val += 128;
	if (val === 0xd8) val--; // don't let the whole pixel become Magic Blue by accident
	if (val === 0) val = 1; // 0 means "this segment doesn't exist"
	return val & 0xff;
}

export function readFeaturesV0(imageData) {
	const f = defaultFeatures();
	f.enabled = true;

	f.earMode = EAR_MODE[magicName(imageData, 1)] ?? 'NONE';
	f.earAnchor = EAR_ANCHOR[magicName(imageData, 2)] ?? 'CENTER';

	const prot = PROTRUSIONS[magicName(imageData, 3)] || [false, false];
	f.claws = prot[0];
	f.horn = prot[1];

	f.tailMode = TAIL_MODE[magicName(imageData, 4)] ?? 'NONE';

	const bend = getPixel(imageData, 5);
	if (bend.rgb === MAGIC_PIXELS.blue) {
		f.tailSegments = 0;
	} else {
		f.tailSegments = 1;
		f.tailBend0 = pxValToUnit(255 - bend.a) * 90;
		f.tailBend1 = pxValToUnit(bend.r) * 90;
		f.tailBend2 = pxValToUnit(bend.g) * 90;
		f.tailBend3 = pxValToUnit(bend.b) * 90;
		if (f.tailBend1 !== 0) {
			f.tailSegments++;
			if (f.tailBend2 !== 0) {
				f.tailSegments++;
				if (f.tailBend3 !== 0) f.tailSegments++;
			}
		}
	}
	if (f.tailSegments < 1) f.tailSegments = 1;

	const snout = getPixel(imageData, 6);
	const etc = getPixel(imageData, 7);
	if (snout.rgb !== MAGIC_PIXELS.blue) {
		f.snoutWidth = Math.min(snout.r, 7);
		f.snoutHeight = Math.min(snout.g, 4);
		f.snoutDepth = Math.min(snout.b, 8);
		f.snoutOffset = etc.g;
		if (f.snoutOffset > 8 - f.snoutHeight) f.snoutOffset = 8 - f.snoutHeight;
	}
	if (f.snoutHeight < 1) f.snoutHeight = 1;
	if (f.snoutDepth < 1) f.snoutDepth = 1;

	if (etc.rgb !== MAGIC_PIXELS.blue) {
		f.chestSize = Math.min(etc.r / 128, 1);
		f.capeEnabled = (etc.b & 16) !== 0;
	}

	f.wingMode = WING_MODE[magicName(imageData, 8)] ?? 'NONE';
	f.animateWings = magicName(imageData, 9) !== 'red';
	f.emissive = magicName(imageData, 10) === 'orange';

	return f;
}

export function writeFeaturesV0(imageData, f) {
	setMagic(imageData, 0, 'blue');
	setMagic(imageData, 1, EAR_MODE_TO_COLOUR[f.earMode] || 'red');
	setMagic(imageData, 2, EAR_ANCHOR_TO_COLOUR[f.earAnchor] || 'blue');
	setMagic(imageData, 3, f.claws && f.horn ? 'cyan' : f.claws ? 'green' : f.horn ? 'purple' : 'red');
	setMagic(imageData, 4, TAIL_MODE_TO_COLOUR[f.tailMode] || 'red');

	// Tail bend: alpha carries segment 0 (inverted), RGB carry segments 1-3.
	// A segment only "exists" if its value is non-zero, which is why
	// degreesToPxVal never returns 0 for segments after the first.
	const segments = f.tailMode === 'NONE' ? 0 : Math.max(1, Math.min(4, f.tailSegments));
	let bendA = 255;
	const bendRGB = [0, 0, 0];
	for (let i = 0; i < segments; i++) {
		const value = degreesToPxVal([f.tailBend0, f.tailBend1, f.tailBend2, f.tailBend3][i], i === 0);
		if (i === 0) bendA = (255 - value) & 0xff;
		else bendRGB[i - 1] = value;
	}
	setPixel(imageData, 5, bendRGB[0], bendRGB[1], bendRGB[2], bendA);

	const snoutOn = f.snoutWidth > 0;
	const width = snoutOn ? f.snoutWidth : 0;
	const height = snoutOn ? f.snoutHeight : 0;
	const depth = snoutOn ? f.snoutDepth : 0;
	let offset = snoutOn ? f.snoutOffset : 0;
	if (offset > 8 - height) offset = 8 - height;
	setPixel(imageData, 6, width, height, depth, 255);
	setPixel(imageData, 7, Math.round(Math.min(f.chestSize, 1) * 128), offset, f.capeEnabled ? 16 : 0, 255);

	setMagic(imageData, 8, WING_MODE_TO_COLOUR[f.wingMode] || 'red');
	setMagic(imageData, 9, f.wingMode !== 'NONE' && f.animateWings ? 'blue' : 'red');
	setMagic(imageData, 10, f.emissive ? 'orange' : 'blue');

	return imageData;
}
