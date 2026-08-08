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

/** The exact names buildMeshes produces, used to recognise our own work. */
function generatedNames() {
	const names = new Set();
	for (const label of Object.values(PART_LABELS)) names.add(`Ears ${label}`);
	for (const label of Object.values(GROUP_LABELS)) if (label) names.add(`Ears ${label}`);
	return names;
}

/**
 * Re-tag meshes we generated in an earlier session.
 *
 * `ears_generated` is a custom property, and Blockbench only serialises its own
 * known fields -- so after saving and reopening a .bbmodel our meshes come back
 * unmarked. Without this, clearGenerated() can't see them and every rebuild
 * stacks another full set on top.
 *
 * Deliberately narrow: an exact name match, and it has to sit under a bone we'd
 * have parented it to, so a mesh the user made and named themselves is safe.
 */
export function adoptOrphans() {
	const names = generatedNames();
	let adopted = 0;
	for (const mesh of Mesh.all) {
		if (mesh[GENERATED_KEY]) continue;
		if (!names.has(mesh.name)) continue;
		const parentName = mesh.parent && mesh.parent.name ? String(mesh.parent.name).toLowerCase() : '';
		const underBone = ['head', 'body', 'torso', 'left arm', 'right arm', 'left leg', 'right leg'].includes(parentName);
		if (!underBone) continue;
		mesh[GENERATED_KEY] = true;
		adopted++;
	}
	return adopted;
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
/** Which Blockbench texture backs each of ears-common's TexSource names. */
const TEXTURE_GROUP = {
	skin: 'skin',
	emissive_skin: 'skin',
	wing: 'wing',
	emissive_wing: 'wing',
	cape: 'cape',
};

const GROUP_LABELS = { skin: '', wing: 'Wing', cape: 'Cape' };

/** Can this quad become a real face, i.e. is there a project texture behind it? */
export function isMeshable(o, textureFor) {
	if (o.type !== 'quad') return false;
	const group = TEXTURE_GROUP[o.texture];
	return !!(group && textureFor(group));
}

/**
 * @param objects    ears-common's quad list
 * @param textureFor (groupName) => Blockbench Texture | null
 */
export function buildMeshes(objects, textureFor) {
	// A rebuild destroys and recreates the elements, which would silently drop
	// the user's selection. Remember it by name and put it back.
	const selectedNames = new Set(
		(typeof Outliner !== 'undefined' && Outliner.selected ? Outliner.selected : [])
			.filter((e) => e[GENERATED_KEY])
			.map((e) => e.name)
	);

	clearGenerated();
	if (!objects || !objects.length) return { meshes: 0, faces: 0, skipped: 0 };

	const mirrored = isMirroredOnX();
	const parts = new Map();
	const buckets = new Map();
	let skipped = 0;

	for (const o of objects) {
		if (o.type !== 'quad') continue;

		const group = TEXTURE_GROUP[o.texture];
		const texture = group ? textureFor(group) : null;
		if (!texture) {
			// No backing texture in the project (e.g. wings enabled but no wing
			// image stored) -- nothing to map UVs against.
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
		const partKey = anchor ? anchor.part : 'head';
		// Split by texture as well as bone, so the wing gets its own selectable
		// element rather than being merged into the body's.
		const key = `${partKey}|${group}`;
		if (!buckets.has(key)) buckets.set(key, { part: anchored, partKey, group, texture, quads: [] });
		buckets.get(key).quads.push({ o, matrix });
	}

	let meshCount = 0;
	let faceCount = 0;

	for (const { part, partKey, group, texture, quads } of buckets.values()) {
		// `??`, not `||`: the skin group's label is deliberately empty so the mesh
		// is named after its bone instead.
		const label = GROUP_LABELS[group] ?? group;
		const mesh = new Mesh({
			name: `Ears ${label || PART_LABELS[partKey] || partKey}`.trim(),
			origin: part.group.origin.slice(),
			vertices: {},
		});
		mesh[GENERATED_KEY] = true;

		for (const { o, matrix } of quads) {
			if (buildFace(mesh, o, matrix, texture)) faceCount++;
		}

		mesh.addTo(part.group);
		mesh.init();
		if (selectedNames.has(mesh.name)) mesh.select({ shiftKey: true }, false);
		meshCount++;
	}

	return { meshes: meshCount, faces: faceCount, skipped };
}

function buildFace(mesh, o, matrix, texture) {
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

	// ears-common normalises UVs against whichever texture it bound, so scale them
	// back up by that texture's own UV size. For the wing and cape that's 20x16,
	// not the project's 64x64 -- which is what Format.per_texture_uv_size buys us.
	const uv = {};
	const tw = texture.getUVWidth ? texture.getUVWidth() : Project.texture_width || 64;
	const th = texture.getUVHeight ? texture.getUVHeight() : Project.texture_height || 64;
	keys.forEach((key, i) => {
		const source = o.uvs[uvOrder[i]];
		uv[key] = [source[0] * tw, source[1] * th];
	});

	const face = new MeshFace(mesh, {
		vertices: keys,
		uv,
		texture: texture ? texture.uuid : false,
	});
	mesh.addFaces(face);
	return face;
}
