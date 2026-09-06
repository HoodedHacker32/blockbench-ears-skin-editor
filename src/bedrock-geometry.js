// ---------------------------------------------------------------------------
// Turns an Ears feature set into Bedrock entity geometry.
//
// Bedrock can't read magic pixels -- no addon can sample a texture -- so the
// configuration is resolved here, at export time, and baked into a skin pack.
// Each skin gets geometry matching its own pixels.
//
// Coordinate mapping (same derivation as src/renderer.js, and verified by
// loading the output in Blockbench): Ears anchors at a cuboid's
// (minX, maxY, minZ) in Minecraft ModelPart space where +Y points DOWN. Bedrock
// geometry shares the X/Z convention with +Y up, so:
//
//     origin  -> (cube.minX, cube.bottomY, cube.minZ)
//     Ears +X -> +X,  Ears +Y -> -Y,  Ears +Z -> +Z
//
// Head anchor is therefore (-4, 24, -4) and the torso's (-4, 12, -2).
// ---------------------------------------------------------------------------

const HEAD = { x: -4, y: 24, z: -4 };
const TORSO = { x: -4, y: 12, z: -2 };

/** Ears' base tail angle per mode, from EarsRenderer. */
const TAIL_ANGLE = { DOWN: 30, BACK: 80, UP: 130 };

/** Which modes we can express as Bedrock geometry. */
export const SUPPORTED_EAR_MODES = ['NONE', 'ABOVE', 'SIDES'];
export const SUPPORTED_TAIL_MODES = ['NONE', 'DOWN', 'BACK', 'UP'];

/** Ears' EarAnchor as a Z offset from the front of the head. */
function anchorZ(earAnchor) {
	if (earAnchor === 'BACK') return 8;
	if (earAnchor === 'FRONT') return 0;
	return 4; // CENTER
}

function vanillaBones(slim) {
	const armWidth = slim ? 3 : 4;
	const rightArmX = slim ? -7 : -8;
	return [
		{ name: 'root', pivot: [0, 0, 0] },
		{ name: 'waist', parent: 'root', pivot: [0, 12, 0] },
		{
			name: 'body', parent: 'waist', pivot: [0, 24, 0],
			cubes: [
				{ origin: [-4, 12, -2], size: [8, 12, 4], uv: [16, 16] },
				{ origin: [-4, 12, -2], size: [8, 12, 4], uv: [16, 32], inflate: 0.25 },
			],
		},
		{
			name: 'head', parent: 'body', pivot: [0, 24, 0],
			cubes: [{ origin: [-4, 24, -4], size: [8, 8, 8], uv: [0, 0] }],
		},
		{
			name: 'hat', parent: 'head', pivot: [0, 24, 0],
			cubes: [{ origin: [-4, 24, -4], size: [8, 8, 8], uv: [32, 0], inflate: 0.5 }],
		},
		{
			name: 'rightArm', parent: 'body', pivot: [-5, 22, 0],
			cubes: [
				{ origin: [rightArmX, 12, -2], size: [armWidth, 12, 4], uv: [40, 16] },
				{ origin: [rightArmX, 12, -2], size: [armWidth, 12, 4], uv: [40, 32], inflate: 0.25 },
			],
		},
		{ name: 'rightItem', parent: 'rightArm', pivot: [-6, 15, 1] },
		{
			name: 'leftArm', parent: 'body', pivot: [5, 22, 0],
			cubes: [
				{ origin: [4, 12, -2], size: [armWidth, 12, 4], uv: [32, 48] },
				{ origin: [4, 12, -2], size: [armWidth, 12, 4], uv: [48, 48], inflate: 0.25 },
			],
		},
		{ name: 'leftItem', parent: 'leftArm', pivot: [6, 15, 1] },
		{
			name: 'rightLeg', parent: 'root', pivot: [-1.9, 12, 0],
			cubes: [
				{ origin: [-3.9, 0, -2], size: [4, 12, 4], uv: [0, 16] },
				{ origin: [-3.9, 0, -2], size: [4, 12, 4], uv: [0, 32], inflate: 0.25 },
			],
		},
		{
			name: 'leftLeg', parent: 'root', pivot: [1.9, 12, 0],
			cubes: [
				{ origin: [-0.1, 0, -2], size: [4, 12, 4], uv: [16, 48] },
				{ origin: [-0.1, 0, -2], size: [4, 12, 4], uv: [0, 48], inflate: 0.25 },
			],
		},
	];
}

/**
 * A zero-thickness quad. Ears textures the back of each quad from a separate,
 * 90-degree-rotated region; Bedrock per-face UV can mirror but not rotate, so
 * both faces use the front region.
 */
function quadUV(u, v, w, h) {
	return {
		north: { uv: [u, v], uv_size: [w, h] },
		south: { uv: [u, v], uv_size: [w, h] },
	};
}

function earBones(features) {
	const z = HEAD.z + anchorZ(features.earAnchor);
	if (features.earMode === 'ABOVE') {
		// translate(-4,-16,0) then a 16x8 quad -- sits directly on top of the head.
		return [{
			name: 'ears', parent: 'head', pivot: [0, 32, z],
			cubes: [{ origin: [HEAD.x - 4, HEAD.y + 8, z], size: [16, 8, 0], uv: quadUV(24, 0, 16, 8) }],
		}];
	}
	if (features.earMode === 'SIDES') {
		// translate(-8,-8,0), then +16 on X for the second ear.
		return [
			{
				name: 'ear_right', parent: 'head', pivot: [-8, 28, z],
				cubes: [{ origin: [HEAD.x - 8, HEAD.y, z], size: [8, 8, 0], uv: quadUV(24, 0, 8, 8) }],
			},
			{
				name: 'ear_left', parent: 'head', pivot: [8, 28, z],
				cubes: [{ origin: [HEAD.x + 8, HEAD.y, z], size: [8, 8, 0], uv: quadUV(32, 0, 8, 8) }],
			},
		];
	}
	return [];
}

function snoutBones(features) {
	const w = features.snoutWidth;
	const h = features.snoutHeight;
	const d = features.snoutDepth;
	const off = features.snoutOffset || 0;
	if (!(w > 0 && h > 0 && d > 0)) return [];

	// translate((8-w)/2, -(offset+h), -depth)
	const x = HEAD.x + (8 - w) / 2;
	const y = HEAD.y + off;
	const z = HEAD.z - d;
	return [{
		name: 'snout', parent: 'head', pivot: [0, y + h, HEAD.z],
		cubes: [{
			origin: [x, y, z], size: [w, h, d],
			// Ears tiles 1px strips along the depth; a single stretched face is
			// the closest Bedrock can get.
			uv: {
				north: { uv: [0, 2], uv_size: [w, h] },
				up: { uv: [0, 1], uv_size: [w, 1] },
				down: { uv: [0, 2 + h], uv_size: [w, 1] },
				east: { uv: [7, 0], uv_size: [1, h] },
				west: { uv: [7, 0], uv_size: [1, h] },
				south: { uv: [0, 2], uv_size: [w, h] },
			},
		}],
	}];
}

function tailBones(features) {
	const base = TAIL_ANGLE[features.tailMode];
	if (base === undefined) return [];

	const segments = Math.max(1, Math.min(4, features.tailSegments || 1));
	const segHeight = 12 / segments;
	const bends = [features.tailBend0, features.tailBend1, features.tailBend2, features.tailBend3];

	// anchorTo(TORSO) then translate(0,-2,4).
	const z = TORSO.z + 4;
	const top = TORSO.y + 2;

	const bones = [];
	for (let i = 0; i < segments; i++) {
		const pivotY = top - i * segHeight;
		// Bedrock's positive X bone rotation matches Ears' positive tail angle --
		// getting this backwards swings the tail forward through the body.
		const rotation = i === 0 ? base + (bends[0] || 0) : bends[i] || 0;
		bones.push({
			name: i === 0 ? 'tail' : `tail_${i}`,
			parent: i === 0 ? 'body' : i === 1 ? 'tail' : `tail_${i - 1}`,
			pivot: [0, pivotY, z],
			rotation: [rotation, 0, 0],
			cubes: [{
				origin: [-4, pivotY - segHeight, z],
				size: [8, segHeight, 0],
				uv: quadUV(56, 16 + i * segHeight, 8, segHeight),
			}],
		});
	}
	return bones;
}

/**
 * @returns {{geometry: object, unsupported: string[]}}
 */
export function buildGeometry(identifier, features, options) {
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

	return {
		geometry: {
			description: {
				identifier,
				texture_width: 64,
				texture_height: 64,
				visible_bounds_width: 4,
				visible_bounds_height: 4.5,
				visible_bounds_offset: [0, 1.5, 0],
			},
			bones,
		},
		unsupported,
	};
}
