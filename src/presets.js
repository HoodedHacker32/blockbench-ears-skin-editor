// ---------------------------------------------------------------------------
// Player model presets, in the shape Blockbench's `skin_model` codec expects.
//
// These match Blockbench's own built-in "Player - Wide" / "Player - Slim"
// presets (Java Edition variants). They're embedded rather than read out of
// Blockbench because its preset table isn't exposed on `window`, and because
// pinning them means the format keeps working if that table is refactored.
//
// Ears is a Java Edition mod and only applies to player skins, so these two are
// the complete set.
//
// Note the codec negates pivot X and rotation X/Y when it parses these, which is
// why the built model ends up mirrored relative to Minecraft's own model space.
// src/renderer.js detects that rather than assuming it.
// ---------------------------------------------------------------------------

const HEAD_AND_BODY = `
			{
				"name": "Waist",
				"color": 0,
				"pivot": [0, 12, 0],
				"pose": [0, 0, 0]
			},
			{
				"name": "Head",
				"parent": "Waist",
				"color": 1,
				"pivot": [0, 24, 0],
				"pose": [-6, 5, 0],
				"cubes": [
					{"name": "Head", "origin": [-4, 24, -4], "size": [8, 8, 8], "uv": [0, 0]},
					{"name": "Hat Layer", "visibility": false, "origin": [-4, 24, -4], "size": [8, 8, 8], "uv": [32, 0], "inflate": 0.5, "layer": true}
				]
			},
			{
				"name": "Body",
				"parent": "Waist",
				"color": 3,
				"pivot": [0, 24, 0],
				"cubes": [
					{"name": "Body", "origin": [-4, 12, -2], "size": [8, 12, 4], "uv": [16, 16]},
					{"name": "Body Layer", "visibility": false, "origin": [-4, 12, -2], "size": [8, 12, 4], "uv": [16, 32], "inflate": 0.25, "layer": true}
				]
			}`;

const LEGS = `
			{
				"name": "Right Leg",
				"color": 6,
				"pivot": [-1.9, 12, 0],
				"pose": [11, 0, 2],
				"cubes": [
					{"name": "Right Leg", "origin": [-3.9, 0, -2], "size": [4, 12, 4], "uv": [0, 16]},
					{"name": "Right Leg Layer", "visibility": false, "origin": [-3.9, 0, -2], "size": [4, 12, 4], "uv": [0, 32], "inflate": 0.25, "layer": true}
				]
			},
			{
				"name": "Left Leg",
				"color": 7,
				"pivot": [1.9, 12, 0],
				"pose": [-10, 0, -2],
				"cubes": [
					{"name": "Left Leg", "origin": [-0.1, 0, -2], "size": [4, 12, 4], "uv": [16, 48]},
					{"name": "Left Leg Layer", "visibility": false, "origin": [-0.1, 0, -2], "size": [4, 12, 4], "uv": [0, 48], "inflate": 0.25, "layer": true}
				]
			}`;

const arms = (width, rightX, leftX) => `
			{
				"name": "Right Arm",
				"parent": "Waist",
				"color": 5,
				"pivot": [-5, 22, 0],
				"pose": [-10, 0, 0],
				"cubes": [
					{"name": "Right Arm", "origin": [${rightX}, 12, -2], "size": [${width}, 12, 4], "uv": [40, 16]},
					{"name": "Right Arm Layer", "visibility": false, "origin": [${rightX}, 12, -2], "size": [${width}, 12, 4], "uv": [40, 32], "inflate": 0.25, "layer": true}
				]
			},
			{
				"name": "Left Arm",
				"parent": "Waist",
				"color": 0,
				"pivot": [5, 22, 0],
				"pose": [12, 0, 0],
				"cubes": [
					{"name": "Left Arm", "origin": [${leftX}, 12, -2], "size": [${width}, 12, 4], "uv": [32, 48]},
					{"name": "Left Arm Layer", "visibility": false, "origin": [${leftX}, 12, -2], "size": [${width}, 12, 4], "uv": [48, 48], "inflate": 0.25, "layer": true}
				]
			}`;

const model = (name, armWidth, rightX, leftX) => `{
		"name": "${name}",
		"texturewidth": 64,
		"textureheight": 64,
		"eyes": [[9, 11], [13, 11]],
		"bones": [${HEAD_AND_BODY},${arms(armWidth, rightX, leftX)},${LEGS}
		]
	}`;

export const MODELS = {
	steve: {
		id: 'steve',
		display_name: 'Player - Wide',
		slim: false,
		model: model('steve', 4, -8, 4),
	},
	alex: {
		id: 'alex',
		display_name: 'Player - Slim',
		slim: true,
		model: model('alex', 3, -7, 4),
	},
};

export function getModel(id) {
	return MODELS[id] || MODELS.steve;
}

// ---------------------------------------------------------------------------
// Starting configurations. These only set the magic pixels -- the artwork is
// still yours to draw, so each one is a sensible skeleton rather than a
// finished look.
// ---------------------------------------------------------------------------

export const FEATURE_PRESETS = {
	none: { label: 'None (all off)', features: {} },
	fox: {
		label: 'Fox',
		features: { earMode: 'ABOVE', earAnchor: 'CENTER', claws: true, tailMode: 'DOWN', tailSegments: 2, tailBend0: 30, tailBend1: -20, snoutWidth: 3, snoutHeight: 2, snoutDepth: 4, snoutOffset: 1 },
	},
	cat: {
		label: 'Cat',
		features: { earMode: 'ABOVE', earAnchor: 'CENTER', claws: true, tailMode: 'UP', tailSegments: 3, tailBend0: -20, tailBend1: -20, tailBend2: -20, snoutWidth: 2, snoutHeight: 1, snoutDepth: 2, snoutOffset: 2 },
	},
	bunny: {
		label: 'Bunny',
		features: { earMode: 'TALL', earAnchor: 'CENTER', tailMode: 'DOWN', tailSegments: 1, snoutWidth: 2, snoutHeight: 2, snoutDepth: 2, snoutOffset: 2 },
	},
	wolf: {
		label: 'Wolf',
		features: { earMode: 'CROSS', earAnchor: 'CENTER', claws: true, tailMode: 'BACK', tailSegments: 2, tailBend0: 15, tailBend1: 15, snoutWidth: 4, snoutHeight: 2, snoutDepth: 5, snoutOffset: 1 },
	},
	deer: {
		label: 'Deer',
		features: { earMode: 'OUT', earAnchor: 'CENTER', horn: true, tailMode: 'UP', tailSegments: 1, snoutWidth: 3, snoutHeight: 2, snoutDepth: 3, snoutOffset: 1 },
	},
	floppy: {
		label: 'Floppy-eared',
		features: { earMode: 'FLOPPY', earAnchor: 'CENTER', tailMode: 'DOWN', tailSegments: 2, tailBend0: 20, tailBend1: 20 },
	},
	winged: {
		label: 'Winged',
		features: { earMode: 'ABOVE', earAnchor: 'CENTER', wingMode: 'SYMMETRIC_DUAL', animateWings: true },
	},
};
