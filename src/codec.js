// ---------------------------------------------------------------------------
// Ears magic-pixel codec (format v1, "Binary")
//
// Straight port of:
//   common/src/main/java/com/unascribed/ears/common/EarsFeaturesParserV1.java
//   common/src/main/java/com/unascribed/ears/common/EarsFeaturesWriterV1.java
//   common/src/main/java/com/unascribed/ears/common/util/Bit{Input,Output}Stream.java
//
// The v1 payload lives in the 4x4 pixel block at x 0..3, y 32..35. The pixel at
// (0,32) is the magic marker 0xEA2501; the other 15 pixels carry 3 bytes each
// (R, G, B in that order), giving a 45 byte / 360 bit budget.
// ---------------------------------------------------------------------------

const MAGIC_V1 = 0xea2501;
const MAGIC_V0 = 0x3f23d8; // Pixelwise. We detect it so we can report it, but don't write it.

const EAR_MODES = ['NONE', 'ABOVE', 'SIDES', 'BEHIND', 'AROUND', 'FLOPPY', 'CROSS', 'OUT', 'TALL', 'TALL_CROSS'];
const EAR_ANCHORS = ['CENTER', 'FRONT', 'BACK'];
const TAIL_MODES = ['NONE', 'DOWN', 'BACK', 'UP', 'VERTICAL', 'CROSS', 'CROSS_OVERLAP', 'STAR', 'STAR_OVERLAP'];
const WING_MODES = ['NONE', 'SYMMETRIC_DUAL', 'SYMMETRIC_SINGLE', 'ASYMMETRIC_L', 'ASYMMETRIC_R', 'ASYMMETRIC_DUAL', 'FLAT'];

class BitReader {
	constructor(bytes) {
		this.bytes = bytes;
		this.pos = 0;
		this.data = 0;
		this.index = -1;
	}
	readBit() {
		if (this.index < 0) {
			if (this.pos >= this.bytes.length) throw new Error('EOF');
			this.data = this.bytes[this.pos++];
			this.index = 6;
			return (this.data >> 7) & 1;
		}
		this.index--;
		return (this.data >> (this.index + 1)) & 1;
	}
	readBoolean() {
		return this.readBit() === 1;
	}
	read(bits) {
		let result = 0;
		for (let i = 0; i < bits; i++) result = (result << 1) | this.readBit();
		return result;
	}
	// Sign-and-magnitude unit value, -1..1
	readSAMUnit(bits) {
		const negative = this.readBoolean();
		const v = this.read(bits);
		const f = v / ((1 << bits) - 1);
		return negative ? -f : f;
	}
	readUnit(bits) {
		return this.read(bits) / ((1 << bits) - 1);
	}
}

class BitWriter {
	constructor() {
		this.out = [];
		this.buffer = 0;
		this.index = 0;
	}
	writeBit(bit) {
		this.buffer = (this.buffer << 1) | (bit & 1);
		this.index++;
		if (this.index >= 8) {
			this.out.push(this.buffer & 0xff);
			this.index = 0;
			this.buffer = 0;
		}
	}
	writeBoolean(v) {
		this.writeBit(v ? 1 : 0);
	}
	write(bits, value) {
		// Java writes MSB-first (it reverses the long then walks it LSB-first).
		for (let i = bits - 1; i >= 0; i--) this.writeBit((value >>> i) & 1);
	}
	writeSAMUnit(bits, value) {
		this.writeBoolean(value < 0);
		const max = (1 << bits) - 1;
		this.write(bits, Math.trunc(Math.abs(value * max)));
	}
	writeUnit(bits, value) {
		const max = (1 << bits) - 1;
		this.write(bits, Math.ceil(value * max));
	}
	finish() {
		while (this.index !== 0) this.writeBit(0); // align
		return Uint8Array.from(this.out);
	}
}

function byOrdinalOr(list, ordinal, fallback) {
	if (ordinal < 0 || ordinal >= list.length) return fallback;
	return list[ordinal];
}

export function defaultFeatures() {
	return {
		enabled: false,
		earMode: 'NONE',
		earAnchor: 'CENTER',
		claws: false,
		horn: false,
		tailMode: 'NONE',
		tailSegments: 1,
		tailBend0: 0,
		tailBend1: 0,
		tailBend2: 0,
		tailBend3: 0,
		snoutWidth: 0,
		snoutHeight: 1,
		snoutDepth: 1,
		snoutOffset: 0,
		chestSize: 0,
		wingMode: 'NONE',
		animateWings: true,
		capeEnabled: false,
		emissive: false,
	};
}

/** Which magic-pixel format, if any, is present at (0,32). */
export function detectFormat(imageData) {
	const i = (32 * imageData.width + 0) * 4;
	const d = imageData.data;
	const rgb = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
	if (d[i + 3] === 0) return 'none';
	if (rgb === MAGIC_V1) return 'v1';
	if (rgb === MAGIC_V0) return 'v0';
	return 'none';
}

/**
 * Read v1 features out of a 64x64 ImageData. Returns null if there's no v1 data
 * (including when v0 data is present -- v0 reading is left to ears-common).
 */
export function readFeatures(imageData) {
	if (detectFormat(imageData) !== 'v1') return null;
	const d = imageData.data;
	const bytes = [];
	for (let y = 0; y < 4; y++) {
		for (let x = 0; x < 4; x++) {
			if (x === 0 && y === 0) continue;
			const i = ((32 + y) * imageData.width + x) * 4;
			bytes.push(d[i], d[i + 1], d[i + 2]);
		}
	}
	const r = new BitReader(Uint8Array.from(bytes));
	const f = defaultFeatures();
	f.enabled = true;
	try {
		r.read(8); // version; currently unused, reserved for appended data

		const ears = r.read(6);
		if (ears === 0) {
			f.earMode = 'NONE';
			f.earAnchor = 'CENTER';
		} else {
			f.earMode = byOrdinalOr(EAR_MODES, Math.floor((ears - 1) / 3) + 1, 'NONE');
			f.earAnchor = byOrdinalOr(EAR_ANCHORS, (ears - 1) % 3, 'CENTER');
		}

		f.claws = r.readBoolean();
		f.horn = r.readBoolean();

		f.tailMode = byOrdinalOr(TAIL_MODES, r.read(3), 'NONE');
		if (f.tailMode !== 'NONE') {
			f.tailSegments = r.read(2) + 1;
			f.tailBend0 = r.readSAMUnit(6) * 90;
			f.tailBend1 = f.tailSegments > 1 ? r.readSAMUnit(6) * 90 : 0;
			f.tailBend2 = f.tailSegments > 2 ? r.readSAMUnit(6) * 90 : 0;
			f.tailBend3 = f.tailSegments > 3 ? r.readSAMUnit(6) * 90 : 0;
		}

		f.snoutWidth = r.read(3);
		if (f.snoutWidth > 0) {
			f.snoutHeight = r.read(2) + 1;
			f.snoutDepth = r.read(3) + 1;
			f.snoutOffset = r.read(3);
			if (f.snoutOffset > 8 - f.snoutHeight) f.snoutOffset = 8 - f.snoutHeight;
		}

		f.chestSize = r.readUnit(5);

		f.wingMode = byOrdinalOr(WING_MODES, r.read(3), 'NONE');
		f.animateWings = f.wingMode === 'NONE' ? false : r.readBoolean();

		f.capeEnabled = r.readBoolean();
		f.emissive = r.readBoolean();
	} catch (e) {
		// Truncated payload: everything decoded so far still stands, which matches
		// the Java parser's behaviour of bailing out and disabling.
		return null;
	}
	return f;
}

/** Encode features to the 45-byte v1 payload. */
export function encodeFeatures(f) {
	const w = new BitWriter();
	w.write(8, 0); // version

	let ears;
	if (f.earMode === 'NONE') {
		ears = 0;
	} else {
		ears = (EAR_MODES.indexOf(f.earMode) - 1) * 3 + EAR_ANCHORS.indexOf(f.earAnchor) + 1;
	}
	w.write(6, ears);
	w.writeBoolean(f.claws);
	w.writeBoolean(f.horn);

	w.write(3, TAIL_MODES.indexOf(f.tailMode));
	if (f.tailMode !== 'NONE') {
		w.write(2, f.tailSegments - 1);
		w.writeSAMUnit(6, f.tailBend0 / 90);
		if (f.tailSegments > 1) w.writeSAMUnit(6, f.tailBend1 / 90);
		if (f.tailSegments > 2) w.writeSAMUnit(6, f.tailBend2 / 90);
		if (f.tailSegments > 3) w.writeSAMUnit(6, f.tailBend3 / 90);
	}

	if (f.snoutWidth > 0 && f.snoutHeight > 0 && f.snoutDepth > 0) {
		w.write(3, f.snoutWidth);
		w.write(2, f.snoutHeight - 1);
		w.write(3, f.snoutDepth - 1);
		w.write(3, f.snoutOffset);
	} else {
		w.write(3, 0);
	}

	w.writeUnit(5, f.chestSize);

	w.write(3, WING_MODES.indexOf(f.wingMode));
	if (f.wingMode !== 'NONE') w.writeBoolean(f.animateWings);

	w.writeBoolean(f.capeEnabled);
	w.writeBoolean(f.emissive);

	const bytes = w.finish();
	if (bytes.length > 45) throw new Error(`Ears v1 payload is ${bytes.length} bytes; only 45 fit`);
	return bytes;
}

/** Write the magic pixels for `f` into a 64x64 ImageData, in place. */
export function writeFeatures(imageData, f) {
	const payload = encodeFeatures(f);
	const d = imageData.data;
	let p = 0;
	for (let y = 0; y < 4; y++) {
		for (let x = 0; x < 4; x++) {
			const i = ((32 + y) * imageData.width + x) * 4;
			if (x === 0 && y === 0) {
				d[i] = (MAGIC_V1 >> 16) & 0xff;
				d[i + 1] = (MAGIC_V1 >> 8) & 0xff;
				d[i + 2] = MAGIC_V1 & 0xff;
			} else {
				d[i] = payload[p++] || 0;
				d[i + 1] = payload[p++] || 0;
				d[i + 2] = payload[p++] || 0;
			}
			d[i + 3] = 0xff;
		}
	}
	return imageData;
}

/** Blank the whole 4x4 magic block, disabling Ears for this skin. */
export function clearFeatures(imageData) {
	const d = imageData.data;
	for (let y = 0; y < 4; y++) {
		for (let x = 0; x < 4; x++) {
			const i = ((32 + y) * imageData.width + x) * 4;
			d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0;
		}
	}
	return imageData;
}

export const Enums = { EAR_MODES, EAR_ANCHORS, TAIL_MODES, WING_MODES };
