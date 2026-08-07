// ---------------------------------------------------------------------------
// Builds the Ears geometry as real Blockbench Mesh elements.
//
// Why bother, when a raw three.js overlay is simpler? Because Blockbench's paint
// pipeline resolves a 3D click to `element.faces[face].uv` -- it needs an actual
// element with real faces. Raw meshes can't participate, so with the overlay you
// can look at the ears but not paint them. As real Mesh elements they behave like
// any other geometry: paint in 3D, select, hide, move, delete.
//
// Two details that aren't obvious:
//
//  * Mesh face UVs are in texture pixels (0..texture_width), not normalised.
//  * Blockbench renders meshes DoubleSide, but Ears emits coincident front/back
//    quad pairs that rely on backface culling. Left alone they z-fight, so the
//    pair is straddled by +/-SHEET across the true plane -- a paper-thin sheet,
//    which is what the pair represents anyway.
// ---------------------------------------------------------------------------

import { resolvePart, isMirroredOnX, applyMoves } from './renderer.js';

/** Half-thickness of a front/back quad pair, in model units. */
const SHEET = 0.01;

const PART_LABELS = {
	head: 'Head',
	torso: 'Body',
	left_arm: 'Left Arm',
	right_arm: 'Right Arm',
	left_leg: 'Left Leg',
	right_leg: 'Right Leg',
};

/** Marks elements we generated, so a rebuild only clears its own work. */
export const GENERATED_KEY = 'ears_generated';

export function generatedMeshes() {
	return Mesh.all.filter((m) => m[GENERATED_KEY]);
}

/** Remove previously generated Ears meshes without touching anything else. */
export function clearGenerated() {
	const existing = generatedMeshes();
	for (const mesh of existing) mesh.remove();
	return existing.length;
}

/**
 * Snapshot of what a build produced, so we can tell whether a rebuild is needed
 * and report what happened.
 */
export function buildMeshes(objects, skinTexture) {
	// A rebuild destroys and recreates the elements, which would silently drop
	// the user's selection. Remember it by name and put it back.
	const selectedNames = new Set(
		(typeof Outliner !== 'undefined' && Outliner.selected ? Outliner.selected : [])
			.filter((e) => e[GENERATED_KEY])
			.map((e) => e.name)
	);

	clearGenerated();
	if (!objects || !objects.length || !skinTexture) return { meshes: 0, faces: 0, skipped: 0 };

	const mirrored = isMirroredOnX();
	const parts = new Map();
	const byPart = new Map();
	let skipped = 0;

	for (const o of objects) {
		if (o.type !== 'quad') continue;
		// Only quads sampling the skin can become faces: mesh UVs are in project
		// resolution, so a 20x16 wing texture wouldn't map. Those keep using the
		// read-only overlay.
		if (o.texture !== 'skin' && o.texture !== 'emissive_skin') {
			skipped++;
			continue;
		}

		const matrix = new THREE.Matrix4();
		const anchored = applyMoves(matrix, o.moves || [], parts, mirrored);
		if (!anchored) {
			skipped++;
			continue;
		}

		const anchor = (o.moves || []).find((m) => m.type === 'anchor');
		const key = anchor ? anchor.part : 'head';
		if (!byPart.has(key)) byPart.set(key, { part: anchored, quads: [] });
		byPart.get(key).quads.push({ o, matrix });
	}

	let meshCount = 0;
	let faceCount = 0;

	for (const [partKey, { part, quads }] of byPart) {
		const mesh = new Mesh({
			name: `Ears ${PART_LABELS[partKey] || partKey}`,
			origin: part.group.origin.slice(),
			vertices: {},
		});
		mesh[GENERATED_KEY] = true;

		for (const { o, matrix } of quads) {
			const face = buildFace(mesh, o, matrix, skinTexture);
			if (face) faceCount++;
		}

		mesh.addTo(part.group);
		mesh.init();
		if (selectedNames.has(mesh.name)) mesh.select({ shiftKey: true }, false);
		meshCount++;
	}

	return { meshes: meshCount, faces: faceCount, skipped };
}

function buildFace(mesh, o, matrix, skinTexture) {
	const w = o.width;
	const h = o.height;
	// Push the sheet a hair towards whichever side this quad faces, so a
	// front/back pair doesn't sit in exactly the same plane.
	const z = o.back ? SHEET : -SHEET;

	// Perimeter order around the quad, in Ears local space (y is down).
	const corners = [
		[0, 0, z],
		[0, h, z],
		[w, h, z],
		[w, 0, z],
	];
	// Matching UV corners: uvs[3] is (minU,minV), [0] is (minU,maxV),
	// [1] is (maxU,maxV), [2] is (maxU,minV).
	const uvOrder = [3, 0, 1, 2];

	const positions = corners.map((c) => {
		const v = new THREE.Vector3(c[0], c[1], c[2]).applyMatrix4(matrix);
		return [v.x, v.y, v.z];
	});

	const keys = mesh.addVertices(...positions);

	const uv = {};
	const tw = Project.texture_width || 64;
	const th = Project.texture_height || 64;
	keys.forEach((key, i) => {
		const source = o.uvs[uvOrder[i]];
		uv[key] = [source[0] * tw, source[1] * th];
	});

	const face = new MeshFace(mesh, {
		vertices: keys,
		uv,
		texture: skinTexture ? skinTexture.uuid : false,
	});
	mesh.addFaces(face);
	return face;
}
