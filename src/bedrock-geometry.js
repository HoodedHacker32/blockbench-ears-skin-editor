// ---------------------------------------------------------------------------
// Turns an Ears feature set into Bedrock skin geometry.
//
// Bedrock can't read magic pixels -- no addon can sample a texture -- so the
// configuration is resolved here, at export time, and baked into a skin pack.
// Each skin gets geometry matching its own pixels.
//
// Coordinate mapping (same derivation as src/renderer.js, verified by loading
// the output in Blockbench): Ears anchors at a cuboid's (minX, maxY, minZ) in
// Minecraft ModelPart space where +Y points DOWN. Bedrock geometry shares the
// X/Z convention with +Y up, so:
//
//     origin  -> (cube.minX, cube.bottomY, cube.minZ)
//     Ears +X -> +X,  Ears +Y -> -Y,  Ears +Z -> +Z
//
// Head anchor is therefore (-4, 24, -4) and the torso's (-4, 12, -2).
//
// Everything here is expressed with BOX UV and bone-level rotation only. That's
// not a constraint the format imposes -- skin packs use the same 1.12.0
// geometry the game's own `vanilla` skin pack uses -- it's just what Ears wants:
// it draws flat quads, and a zero-depth cube's box UV lands exactly on [u, v].
//
// The vanilla bones below are copied verbatim from that pack's
// geometry.humanoid.custom and .customSlim, quirks included, so the only thing
// that ever differs from a stock player is the Ears parts appended after them.
// ---------------------------------------------------------------------------

const HEAD = { x: -4, y: 24, z: -4 };
const TORSO = { x: -4, y: 12, z: -2 };

/**
 * BACK and the cross/star family share one rule in EarsRenderer: 90 degrees when
 * the first segment is bent, 80 otherwise.
 */
const FAN_MODES = ['BACK', 'CROSS', 'CROSS_OVERLAP', 'STAR', 'STAR_OVERLAP'];

function tailBaseAngle(mode, bend0) {
	if (mode === 'DOWN') return 30;
	if (mode === 'UP') return 130;
	if (FAN_MODES.includes(mode)) return bend0 !== 0 ? 90 : 80;
	return undefined;
}

/**
 * Extra blades fanned around the tail's centre line. CROSS adds one at 90
 * degrees; STAR adds three at 45, 90 and 135, making a star in cross-section.
 */
function tailFan(mode) {
	if (mode === 'CROSS' || mode === 'CROSS_OVERLAP') return [90];
	if (mode === 'STAR' || mode === 'STAR_OVERLAP') return [45, 90, 135];
	return [];
}

/** The overlap modes extend each segment past the previous one by 4px. */
function tailOverlap(mode) {
	return mode === 'CROSS_OVERLAP' || mode === 'STAR_OVERLAP' ? 4 : 0;
}

export const SUPPORTED_EAR_MODES = ['NONE', 'ABOVE', 'SIDES'];
export const SUPPORTED_TAIL_MODES = [
	'NONE', 'DOWN', 'BACK', 'UP', 'CROSS', 'CROSS_OVERLAP', 'STAR', 'STAR_OVERLAP',
];

/**
 * A flat quad in the XY plane. Zero depth means box UV puts the north face at
 * exactly [u, v] at size [w, h] -- no per-face UV needed.
 */
const quad = (x, y, z, w, h, u, v) => ({ origin: [x, y, z], size: [w, h, 0], uv: [u, v] });

/** Ears' EarAnchor as a Z offset from the front of the head. */
function anchorZ(earAnchor) {
	if (earAnchor === 'BACK') return 8;
	if (earAnchor === 'FRONT') return 0;
	return 4; // CENTER
}

function vanillaBones(slim) {
	// Slim arms are 3 wide and hang half a pixel lower than classic ones.
	const armWidth = slim ? 3 : 4;
	const armY = slim ? 11.5 : 12;
	const armPivotY = slim ? 21.5 : 22;
	const rightArmX = slim ? -7 : -8;
	// A genuine quirk of the vanilla file: the two models disagree on the sign.
	const capeZ = slim ? -3 : 3;

	return [
		{ name: 'root', pivot: [0, 0, 0] },
		{ name: 'waist', parent: 'root', pivot: [0, 12, 0] },
		{
			name: 'body', parent: 'waist', pivot: [0, 24, 0],
			cubes: [{ origin: [-4, 12, -2], size: [8, 12, 4], uv: [16, 16] }],
		},
		{
			name: 'head', parent: 'body', pivot: [0, 24, 0],
			cubes: [{ origin: [-4, 24, -4], size: [8, 8, 8], uv: [0, 0] }],
		},
		{ name: 'cape', parent: 'body', pivot: [0, 24, capeZ] },
		{
			name: 'hat', parent: 'head', pivot: [0, 24, 0],
			cubes: [{ origin: [-4, 24, -4], size: [8, 8, 8], uv: [32, 0], inflate: 0.5 }],
		},
		{
			name: 'leftArm', parent: 'body', pivot: [5, armPivotY, 0],
			cubes: [{ origin: [4, armY, -2], size: [armWidth, 12, 4], uv: [32, 48] }],
		},
		{
			name: 'leftSleeve', parent: 'leftArm', pivot: [5, armPivotY, 0],
			cubes: [{ origin: [4, armY, -2], size: [armWidth, 12, 4], uv: [48, 48], inflate: 0.25 }],
		},
		{ name: 'leftItem', parent: 'leftArm', pivot: [6, 15, 1] },
		{
			name: 'rightArm', parent: 'body', pivot: [-5, armPivotY, 0],
			cubes: [{ origin: [rightArmX, armY, -2], size: [armWidth, 12, 4], uv: [40, 16] }],
		},
		{
			name: 'rightSleeve', parent: 'rightArm', pivot: [-5, armPivotY, 0],
			cubes: [{ origin: [rightArmX, armY, -2], size: [armWidth, 12, 4], uv: [40, 32], inflate: 0.25 }],
		},
		{ name: 'rightItem', parent: 'rightArm', pivot: [-6, 15, 1] },
		{
			name: 'leftLeg', parent: 'root', pivot: [1.9, 12, 0],
			cubes: [{ origin: [-0.1, 0, -2], size: [4, 12, 4], uv: [16, 48] }],
		},
		{
			name: 'leftPants', parent: 'leftLeg', pivot: [1.9, 12, 0],
			cubes: [{ origin: [-0.1, 0, -2], size: [4, 12, 4], uv: [0, 48], inflate: 0.25 }],
		},
		{
			name: 'rightLeg', parent: 'root', pivot: [-1.9, 12, 0],
			cubes: [{ origin: [-3.9, 0, -2], size: [4, 12, 4], uv: [0, 16] }],
		},
		{
			name: 'rightPants', parent: 'rightLeg', pivot: [-1.9, 12, 0],
			cubes: [{ origin: [-3.9, 0, -2], size: [4, 12, 4], uv: [0, 32], inflate: 0.25 }],
		},
		{
			name: 'jacket', parent: 'body', pivot: [0, 24, 0],
			cubes: [{ origin: [-4, 12, -2], size: [8, 12, 4], uv: [16, 32], inflate: 0.25 }],
		},
	];
}

function earBones(features) {
	const z = HEAD.z + anchorZ(features.earAnchor);
	if (features.earMode === 'ABOVE') {
		// translate(-4,-16,0) then a 16x8 quad -- sits directly on top of the head.
		return [{
			name: 'ears', parent: 'head', pivot: [0, 32, z],
			cubes: [quad(HEAD.x - 4, HEAD.y + 8, z, 16, 8, 24, 0)],
		}];
	}
	if (features.earMode === 'SIDES') {
		// translate(-8,-8,0), then +16 on X for the second ear.
		return [
			{ name: 'ear_right', parent: 'head', pivot: [-8, 28, z], cubes: [quad(HEAD.x - 8, HEAD.y, z, 8, 8, 24, 0)] },
			{ name: 'ear_left', parent: 'head', pivot: [8, 28, z], cubes: [quad(HEAD.x + 8, HEAD.y, z, 8, 8, 32, 0)] },
		];
	}
	return [];
}

/**
 * The snout, built the way Ears builds it: a front quad plus 1px strips tiled
 * along the depth for the top, bottom and both sides.
 *
 * It can't be a plain box. Box UV offsets every face by the cube's depth, so a
 * box deep enough to be a snout would sample the wrong pixels -- and the strips
 * Ears reads sit at x=0, which no positive UV offset can reach. Rotated bones
 * holding flat quads land on them exactly, and match the original more closely
 * into the bargain.
 */
function snoutBones(features) {
	const w = features.snoutWidth;
	const h = features.snoutHeight;
	const d = features.snoutDepth;
	const off = features.snoutOffset || 0;
	if (!(w > 0 && h > 0 && d > 0)) return [];

	// translate((8-w)/2, -(offset+h), -depth) from the head anchor.
	const x0 = HEAD.x + (8 - w) / 2;
	const y0 = HEAD.y + off;      // bottom
	const y1 = y0 + h;            // top
	const zBack = HEAD.z;         // against the face
	const zFront = zBack - d;

	const bones = [
		{ name: 'snout', parent: 'head', pivot: [0, y1, zBack], cubes: [quad(x0, y0, zFront, w, h, 0, 2)] },
	];

	// Rotating -90 about X maps a quad at y = y1 + k onto the horizontal strip
	// covering z = zBack - k - 1 .. zBack - k.
	const top = { name: 'snout_top', parent: 'snout', pivot: [0, y1, zBack], rotation: [-90, 0, 0], cubes: [] };
	const bottom = { name: 'snout_bottom', parent: 'snout', pivot: [0, y0, zBack], rotation: [90, 0, 0], cubes: [] };
	const right = { name: 'snout_right', parent: 'snout', pivot: [x0, 0, zBack], rotation: [0, 90, 0], cubes: [] };
	const left = { name: 'snout_left', parent: 'snout', pivot: [x0 + w, 0, zBack], rotation: [0, 90, 0], cubes: [] };

	for (let k = 0; k < d; k++) {
		// Ears uses a distinct first strip, then repeats one texture for the rest.
		top.cubes.push(quad(x0, y1 + k, zBack, w, 1, 0, k === 0 ? 1 : 0));
		bottom.cubes.push(quad(x0, y0 - k - 1, zBack, w, 1, 0, k === 0 ? 2 + h : 3 + h));
		right.cubes.push(quad(x0 + k, y0, zBack, 1, h, 7, k === 0 ? 0 : 4));
		left.cubes.push(quad(x0 + w + k, y0, zBack, 1, h, 7, k === 0 ? 0 : 4));
	}

	bones.push(top, bottom, right, left);
	return bones;
}

function tailBones(features) {
	const bend0 = features.tailBend0 || 0;
	const base = tailBaseAngle(features.tailMode, bend0);
	if (base === undefined) return [];

	const segments = Math.max(1, Math.min(4, features.tailSegments || 1));
	const segHeight = 12 / segments;
	const bends = [bend0, features.tailBend1, features.tailBend2, features.tailBend3];
	const fan = tailFan(features.tailMode);
	const overlap = tailOverlap(features.tailMode);

	// anchorTo(TORSO) then translate(0,-2,4).
	const z = TORSO.z + 4;
	const top = TORSO.y + 2;

	const bones = [];
	for (let i = 0; i < segments; i++) {
		const pivotY = top - i * segHeight;
		// Bedrock's positive X bone rotation matches Ears' positive tail angle --
		// getting this backwards swings the tail forward through the body.
		const rotation = i === 0 ? base + bend0 : bends[i] || 0;

		// The overlap modes let every segment after the first reach back over the
		// previous one, so the seam doesn't show when the tail bends.
		const ofs = i === 0 ? 0 : overlap;
		const height = segHeight + ofs;
		const bottom = pivotY - segHeight;
		const v = 16 + i * segHeight - ofs;

		const name = i === 0 ? 'tail' : `tail_${i}`;
		bones.push({
			name,
			parent: i === 0 ? 'body' : i === 1 ? 'tail' : `tail_${i - 1}`,
			pivot: [0, pivotY, z],
			rotation: [rotation, 0, 0],
			cubes: [quad(-4, bottom, z, 8, height, 56, v)],
		});

		// Blades rotated about the tail's own centre line. They have to be their
		// own bones, so each blade can carry its own rotation.
		fan.forEach((angle, n) => {
			bones.push({
				name: `${name}_blade${n + 1}`,
				parent: name,
				pivot: [0, bottom, z],
				rotation: [0, angle, 0],
				cubes: [quad(-4, bottom, z, 8, height, 56, v)],
			});
		});
	}
	return bones;
}

/**
 * @returns {{bones: object[], unsupported: string[]}}
 */
export function buildGeometry(features, options) {
	const slim = !!(options && options.slim);
	const unsupported = [];

	if (features.enabled) {
		if (features.earMode && !SUPPORTED_EAR_MODES.includes(features.earMode)) {
			unsupported.push(`ear mode ${features.earMode}`);
		}
		if (features.tailMode && !SUPPORTED_TAIL_MODES.includes(features.tailMode)) {
			unsupported.push(`tail mode ${features.tailMode}`);
		}
		if (features.claws) unsupported.push('claws');
		if (features.horn) unsupported.push('horn');
		if (features.wingMode && features.wingMode !== 'NONE') unsupported.push('wings');
		if (features.capeEnabled) unsupported.push('cape');
		if (features.chestSize > 0) unsupported.push('chest');
		if (features.emissive) unsupported.push('emissive');
	}

	const bones = vanillaBones(slim);
	if (features.enabled) {
		bones.push(...earBones(features), ...snoutBones(features), ...tailBones(features));
	}

	return { bones, unsupported };
}

/**
 * Wrap bones in a skin-pack geometry entry.
 *
 * Skin packs use format_version 1.12.0 -- the same one the game's own `vanilla`
 * skin pack ships -- where each geometry is an entry in a `minecraft:geometry`
 * array with its identifier inside `description`. Handing Bedrock a bare
 * top-level key instead makes it silently fall back to the default player
 * model: default 4px arms and none of the Ears parts.
 */
export function geometryEntry(identifier, bones) {
	return {
		description: {
			identifier,
			texture_width: 64,
			texture_height: 64,
			visible_bounds_width: 4,
			visible_bounds_height: 4.5,
			visible_bounds_offset: [0, 1.5, 0],
		},
		bones,
	};
}
