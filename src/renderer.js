// ---------------------------------------------------------------------------
// Turns ears-common's flat quad list into three.js meshes parented into
// Blockbench's bone hierarchy, so the Ears geometry follows posing and
// animation for free.
//
// Coordinate mapping (verified against EarsRenderer.java, the 1.21 Fabric
// delegate, and the web Manipulator):
//
//   anchorTo(part) puts the origin at the part cuboid's (minX, maxY, minZ) in
//   Minecraft ModelPart space, where +Y points DOWN. Blockbench cubes are stored
//   in the same X/Z convention with +Y UP, and a cube's minimum corner is
//   `cube.from`. So:
//
//       Ears +X -> Blockbench +X
//       Ears +Y -> Blockbench -Y
//       Ears +Z -> Blockbench +Z        (+Z is the player's back)
//       origin  -> cube.from
//
//   Cross-checks: EarMode.ABOVE translates (-4,-16,0) and draws a 16x8 quad,
//   landing at Blockbench y 32..40 -- directly on top of a head that ends at 32.
//   EarAnchor.CENTER translates (0,0,4) from a head starting at z=-4, landing on
//   the head's centre plane.
// ---------------------------------------------------------------------------

const PART_ALIASES = {
	head: ['head'],
	torso: ['body', 'torso'],
	left_arm: ['left arm', 'leftarm', 'arm_left'],
	right_arm: ['right arm', 'rightarm', 'arm_right'],
	left_leg: ['left leg', 'leftleg', 'leg_left'],
	right_leg: ['right leg', 'rightleg', 'leg_right'],
};

const normalise = (s) => String(s || '').toLowerCase().replace(/[_\-]+/g, ' ').trim();

function isLayerCube(cube) {
	const n = normalise(cube.name);
	return n.includes('layer') || n.includes('hat') || n.includes('jacket') || n.includes('sleeve');
}

/**
 * Resolve an Ears body part to { group, cube } from the current project.
 * Returns null when the project has no matching bone (custom models).
 */
export function resolvePart(partName) {
	const aliases = PART_ALIASES[partName];
	if (!aliases) return null;

	let group = null;
	for (const g of Group.all) {
		if (aliases.includes(normalise(g.name))) {
			group = g;
			break;
		}
	}
	if (!group || !group.mesh) return null;

	// Prefer a base (non-layer) cube inside the bone; fall back to any cube.
	const children = group.children ? group.children.filter((c) => c instanceof Cube) : [];
	let cube = children.find((c) => !isLayerCube(c)) || children[0];
	if (!cube) return null;

	return { group, cube };
}

/**
 * Blockbench builds the skin model mirrored on X relative to Minecraft's own
 * model space: the bone named "Right Arm" sits at +X here but at -X in
 * Minecraft. Detect it from the model rather than assuming, so hand-built or
 * future models still line up.
 */
export function isMirroredOnX() {
	for (const group of Group.all) {
		const name = normalise(group.name);
		if (name === 'right arm' || name === 'right leg') return group.origin[0] > 0;
		if (name === 'left arm' || name === 'left leg') return group.origin[0] < 0;
	}
	return false;
}

function buildAnchorMatrix(part, mirrored) {
	// Ears anchors at the cuboid's (minX, maxY, minZ) in Minecraft ModelPart
	// space, where +Y points down. Mapping that into this bone's local space
	// (model space minus the group origin):
	//
	//   MC minX -> cube.to[0] when mirrored, cube.from[0] otherwise
	//   MC maxY -> cube.from[1]  (the bottom of the cube; +Y is down in MC)
	//   MC minZ -> cube.from[2]
	//
	// and the axes scale by (mirrored ? -1 : 1, -1, 1).
	const [ox, oy, oz] = part.group.origin;
	const anchorX = mirrored ? part.cube.to[0] : part.cube.from[0];
	return new THREE.Matrix4()
		.makeTranslation(anchorX - ox, part.cube.from[1] - oy, part.cube.from[2] - oz)
		.multiply(new THREE.Matrix4().makeScale(mirrored ? -1 : 1, -1, 1));
}

export function applyMoves(matrix, moves, parts, mirrored) {
	let anchored = null;
	for (const m of moves) {
		switch (m.type) {
			case 'anchor': {
				const part = parts.get(m.part) || resolvePart(m.part);
				if (!part) return null;
				parts.set(m.part, part);
				anchored = part;
				matrix.copy(buildAnchorMatrix(part, mirrored));
				break;
			}
			case 'translate':
				matrix.multiply(new THREE.Matrix4().makeTranslation(m.x, m.y, m.z));
				break;
			case 'scale':
				matrix.multiply(new THREE.Matrix4().makeScale(m.x || 1e-6, m.y || 1e-6, m.z || 1e-6));
				break;
			case 'rotate': {
				const axis = new THREE.Vector3(m.x, m.y, m.z);
				if (axis.lengthSq() === 0) break;
				matrix.multiply(new THREE.Matrix4().makeRotationAxis(axis.normalize(), (m.ang * Math.PI) / 180));
				break;
			}
			default:
				break;
		}
	}
	return anchored;
}

/**
 * One quad, in Ears local space: x 0..w, y 0..h (y is down), z 0.
 *
 * uvs come from EarsCommon.calculateUVs and are already normalised against the
 * bound texture, with v measured from the top -- three.js measures from the
 * bottom, hence 1-v.
 */
function buildQuadGeometry(width, height, uvs) {
	const geom = new THREE.BufferGeometry();
	// prettier-ignore
	const positions = new Float32Array([
		0,      0,      0,
		0,      height, 0,
		width,  0,      0,
		width,  height, 0,
	]);
	// prettier-ignore
	const uv = new Float32Array([
		uvs[3][0], 1 - uvs[3][1],
		uvs[0][0], 1 - uvs[0][1],
		uvs[2][0], 1 - uvs[2][1],
		uvs[1][0], 1 - uvs[1][1],
	]);
	geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
	geom.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
	// Wound so the geometric normal is -Z, i.e. the face is visible from the
	// front when the transform preserves handedness.
	geom.setIndex([0, 1, 2, 2, 1, 3]);
	geom.computeVertexNormals();
	return geom;
}

export class EarsPreview {
	constructor() {
		this.meshes = [];
		this.materials = new Map();
		this.textures = new Map();
		this.missingParts = new Set();
	}

	/** Register/replace a THREE texture for one of ears-common's TexSource names. */
	setTexture(name, canvas) {
		const existing = this.textures.get(name);
		if (existing && existing.image === canvas) {
			existing.needsUpdate = true;
			return;
		}
		if (existing) existing.dispose();
		if (!canvas) {
			this.textures.delete(name);
			return;
		}
		const tex = new THREE.CanvasTexture(canvas);
		tex.magFilter = THREE.NearestFilter;
		tex.minFilter = THREE.NearestFilter;
		tex.generateMipmaps = false;
		this.textures.set(name, tex);
		// Materials cache the old texture object; drop them so they rebind.
		this.disposeMaterials();
	}

	/** Flag every texture as dirty -- call after painting. */
	refreshTextures() {
		for (const tex of this.textures.values()) tex.needsUpdate = true;
	}

	getMaterial(textureName, side, emissive) {
		const key = `${textureName}|${side}|${emissive}`;
		let mat = this.materials.get(key);
		if (mat) return mat;

		const map = this.textures.get(textureName) || this.textures.get('skin') || null;
		const params = {
			map,
			color: 0xffffff,
			transparent: true,
			alphaTest: 0.1,
			side,
			fog: false,
			flatShading: true,
		};
		mat = emissive
			? new THREE.MeshBasicMaterial(params)
			: new THREE.MeshLambertMaterial({ ...params, reflectivity: -1 });
		mat.name = `ears_${key}`;
		this.materials.set(key, mat);
		return mat;
	}

	disposeMaterials() {
		for (const mat of this.materials.values()) mat.dispose();
		this.materials.clear();
	}

	clear() {
		for (const mesh of this.meshes) {
			if (mesh.parent) mesh.parent.remove(mesh);
			mesh.geometry.dispose();
		}
		this.meshes = [];
		this.missingParts.clear();
	}

	/**
	 * Rebuild the preview from a renderObjects list.
	 *
	 * `accept` optionally filters which quads this path handles -- when the
	 * project supports Mesh elements, the skin quads are built as real geometry
	 * instead and only the rest (wings, cape) fall through to here.
	 */
	build(objects, accept = null) {
		this.clear();
		if (!objects || !objects.length) return;

		const parts = new Map();
		const mirrored = isMirroredOnX();
		for (const o of objects) {
			if (o.type !== 'quad') continue; // 'point' objects are debug-only
			if (accept && !accept(o)) continue;

			const matrix = new THREE.Matrix4();
			const anchored = applyMoves(matrix, o.moves || [], parts, mirrored);
			if (!anchored) {
				const missing = (o.moves || []).find((m) => m.type === 'anchor');
				if (missing) this.missingParts.add(missing.part);
				continue;
			}

			const geom = buildQuadGeometry(o.width, o.height, o.uvs);
			geom.applyMatrix4(matrix);
			geom.computeVertexNormals();

			// A transform with negative determinant reverses winding, so the
			// visible side flips with it.
			const flipsWinding = matrix.determinant() < 0;
			const side = o.back !== flipsWinding ? THREE.BackSide : THREE.FrontSide;

			const mesh = new THREE.Mesh(geom, this.getMaterial(o.texture, side, !!o.emissive));
			mesh.name = 'ears_quad';
			mesh.renderOrder = 1;
			// Blockbench raycasts against scene children for selection; keep the
			// preview out of it so it can't be clicked or transformed.
			mesh.isEarsPreview = true;
			mesh.raycast = () => {};

			anchored.group.mesh.add(mesh);
			this.meshes.push(mesh);
		}
	}

	dispose() {
		this.clear();
		this.disposeMaterials();
		for (const tex of this.textures.values()) tex.dispose();
		this.textures.clear();
	}
}
