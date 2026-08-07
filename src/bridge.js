// ---------------------------------------------------------------------------
// Bridge to ears-common.js (the TeaVM build of Ears' `common` module).
//
// ears-common is written for the web Manipulator, so it talks to the page in a
// few hardcoded ways:
//
//   - reads the skin from `document.getElementById("skin")`, a 64x64 <canvas>
//   - reads `document.getElementById("slim-enabled").checked`
//   - reads `document.getElementById("torso2-enabled").checked`  (jacket layer)
//   - writes results to window.renderObjects / window.alfalfaData / etc.
//   - reads window.alfalfaData back when encoding
//
// Rather than injecting elements with those ids into Blockbench's DOM (where
// "skin" is a plausible collision), we swap `document.getElementById` for the
// duration of each call. Nothing of ours is left in the document, and nothing
// of Blockbench's is shadowed outside the call.
// ---------------------------------------------------------------------------

const SHIM_IDS = {
	skin: 'canvas',
	'slim-enabled': 'slim',
	'torso2-enabled': 'jacket',
};

const state = {
	ready: false,
	canvas: null,
	slim: { checked: false },
	jacket: { checked: true },
	rebuildQuads: null,
	encodeAlfalfa: null,
	version: null,
};

/**
 * Run `fn` with document.getElementById patched to serve our shim elements.
 * Restored in a finally block so a throw inside ears-common can't leave the
 * document patched.
 */
function withShim(fn) {
	const original = document.getElementById;
	document.getElementById = function (id) {
		const key = SHIM_IDS[id];
		if (key) return state[key];
		return original.call(this, id);
	};
	try {
		return fn();
	} finally {
		document.getElementById = original;
	}
}

/** Capture and remove the globals ears-common writes to `window`. */
function takeGlobal(name) {
	const value = window[name];
	try {
		delete window[name];
	} catch (e) {
		window[name] = undefined;
	}
	return value;
}

/**
 * Initialise ears-common once. `initCommon` is a free variable resolved from the
 * enclosing bundle scope -- see build.mjs, which concatenates the vendored
 * ears-common.js (`var initCommon;`) ahead of this code inside one IIFE.
 */
export function init() {
	if (state.ready) return true;
	if (typeof initCommon !== 'function') {
		console.error('[Ears] ears-common.js did not load; initCommon is missing');
		return false;
	}

	state.canvas = document.createElement('canvas');
	state.canvas.width = 64;
	state.canvas.height = 64;
	state.ctx = state.canvas.getContext('2d', { willReadFrequently: true });

	// TeaVM's entry point takes (argv, callback) and, in this build, runs the
	// main method synchronously before returning.
	withShim(() => initCommon([]));

	state.version = takeGlobal('commonVersion');
	state.rebuildQuads = takeGlobal('rebuildQuads');
	state.encodeAlfalfa = takeGlobal('encodeAlfalfa');

	if (typeof state.rebuildQuads !== 'function') {
		console.error('[Ears] ears-common initialised but did not export rebuildQuads');
		return false;
	}
	state.ready = true;
	return true;
}

export function isReady() {
	return state.ready;
}

export function commonVersion() {
	return state.version;
}

/** Copy a 64x64 ImageData into the canvas ears-common reads from. */
function loadSkin(imageData) {
	state.ctx.clearRect(0, 0, 64, 64);
	state.ctx.putImageData(imageData, 0, 0);
}

/**
 * Run the full Ears pipeline over a skin.
 *
 * Returns { objects, alfalfa } where `objects` is the flat quad list described
 * in EarsJS.rebuildQuads and `alfalfa` maps entry name -> Uint8Array.
 */
export function buildQuads(imageData, { slim = false, jacket = true } = {}) {
	if (!state.ready && !init()) return { objects: [], alfalfa: {} };

	loadSkin(imageData);
	state.slim.checked = !!slim;
	state.jacket.checked = !!jacket;

	withShim(() => state.rebuildQuads());

	const objects = takeGlobal('renderObjects') || [];
	const rawAlfalfa = takeGlobal('alfalfaData') || {};
	takeGlobal('magicPixels');
	takeGlobal('magicPixelValues');

	const alfalfa = { version: rawAlfalfa.version || 0, data: {} };
	for (const [key, value] of Object.entries(rawAlfalfa)) {
		if (key === 'version') continue;
		alfalfa.data[key] = binStringToBytes(value);
	}
	return { objects: Array.from(objects), alfalfa };
}

/**
 * Write an Alfalfa payload into a skin's alpha channel, in place.
 *
 * ears-common does the encoding: it reads window.alfalfaData, rewrites the alpha
 * of every pixel in Alfalfa.ENCODE_REGIONS, and puts the result back on the
 * canvas. We hand it the skin and take the modified pixels back.
 */
export function writeAlfalfa(imageData, alfalfa) {
	if (!state.ready && !init()) return imageData;

	loadSkin(imageData);

	const payload = { version: alfalfa.version || 1 };
	for (const [key, bytes] of Object.entries(alfalfa.data || {})) {
		if (!bytes || !bytes.length) continue;
		payload[key] = bytesToBinString(bytes);
	}
	window.alfalfaData = payload;
	try {
		withShim(() => state.encodeAlfalfa());
	} finally {
		takeGlobal('alfalfaData');
	}

	const result = state.ctx.getImageData(0, 0, 64, 64);
	imageData.data.set(result.data);
	return imageData;
}

// ears-common passes byte arrays across the JS boundary as strings with one
// character per byte (see EarsJS.toBinString / fromBinString).
export function binStringToBytes(str) {
	const out = new Uint8Array(str.length);
	for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
	return out;
}

export function bytesToBinString(bytes) {
	let out = '';
	for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i] & 0xff);
	return out;
}
