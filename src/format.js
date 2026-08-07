// ---------------------------------------------------------------------------
// The "Ears Skin" model format.
//
// This is a real ModelFormat, so it shows up on the start screen next to
// Minecraft Skin and gets its own setup dialog. It deliberately reuses
// Blockbench's own machinery rather than reimplementing it:
//
//   * `pose_mode: true` is all that's needed for the full pose system -- the
//     pose Mode gates on Format.pose_mode, and the Skin Pose panel gates on the
//     mode, so posing and the pose presets come along for free.
//   * `Codecs.skin_model.parse()` builds the bones, cubes, box UVs, layer cubes
//     and the template texture exactly as the built-in skin format does.
//
// The only patching needed is widening the handful of built-in toolbar actions
// that hardcode `formats: ['skin']`.
// ---------------------------------------------------------------------------

import * as Codec from './codec.js';
import * as CodecV0 from './codec-v0.js';
import { getModel, MODELS, FEATURE_PRESETS } from './presets.js';

export const FORMAT_ID = 'ears_skin';

// Built-in actions that are useful here but check for the skin format by name.
const SKIN_ACTIONS = [
	'toggle_skin_layer',
	'convert_minecraft_skin_variant',
	'explode_skin_model',
	'custom_skin_poses',
	'add_custom_skin_pose',
];

const patched = [];

/** Let the built-in skin toolbar actions apply to our format too. */
export function patchSkinActions() {
	for (const id of SKIN_ACTIONS) {
		const item = BarItems[id];
		const formats = item && item.condition && item.condition.formats;
		if (!Array.isArray(formats) || formats.includes(FORMAT_ID)) continue;
		formats.push(FORMAT_ID);
		patched.push(formats);
	}
}

export function unpatchSkinActions() {
	for (const formats of patched) {
		const i = formats.indexOf(FORMAT_ID);
		if (i !== -1) formats.splice(i, 1);
	}
	patched.length = 0;
}

// --- the setup dialog ------------------------------------------------------

const EAR_MODES = { NONE: 'None', ABOVE: 'Above', SIDES: 'Sides', OUT: 'Out', AROUND: 'Around', FLOPPY: 'Floppy', CROSS: 'Cross', TALL: 'Tall', TALL_CROSS: 'Tall Cross', BEHIND: 'Behind (old)' };
const EAR_ANCHORS = { CENTER: 'Center', FRONT: 'Front', BACK: 'Back' };
const TAIL_MODES = { NONE: 'None', DOWN: 'Down', BACK: 'Back', UP: 'Up', VERTICAL: 'Vertical', CROSS: 'Cross', CROSS_OVERLAP: 'Overlapping Cross', STAR: 'Star', STAR_OVERLAP: 'Overlapping Star' };
const WING_MODES = { NONE: 'None', SYMMETRIC_DUAL: 'Symmetric Dual', SYMMETRIC_SINGLE: 'Symmetric Single', ASYMMETRIC_L: 'Asymmetric Single (Left)', ASYMMETRIC_R: 'Asymmetric Single (Right)', ASYMMETRIC_DUAL: 'Asymmetric Dual', FLAT: 'Flat' };

const PROTRUSIONS = { none: 'None', claws: 'Claws', horn: 'Horn', both: 'Claws & Horn' };

let dialog = null;
let suppressPresetReset = false;

function formToFeatures(form) {
	const f = Codec.defaultFeatures();
	f.enabled = form.ears_enabled;
	f.earMode = form.ear_mode;
	f.earAnchor = form.ear_anchor;
	f.claws = form.protrusions === 'claws' || form.protrusions === 'both';
	f.horn = form.protrusions === 'horn' || form.protrusions === 'both';
	f.tailMode = form.tail_mode;
	f.tailSegments = form.tail_segments;
	f.snoutWidth = form.snout ? form.snout_width : 0;
	f.snoutHeight = form.snout_height;
	f.snoutDepth = form.snout_depth;
	f.snoutOffset = form.snout_offset;
	f.chestSize = form.chest_size;
	f.wingMode = form.wing_mode;
	f.animateWings = form.animate_wings;
	f.capeEnabled = form.cape;
	f.emissive = form.emissive;
	// Ears clamps the snout offset against its height; mirror that so the dialog
	// can't produce a config that reads back differently.
	if (f.snoutOffset > 8 - f.snoutHeight) f.snoutOffset = 8 - f.snoutHeight;
	return f;
}

function featuresToForm(features) {
	const protrusions = features.claws && features.horn ? 'both' : features.claws ? 'claws' : features.horn ? 'horn' : 'none';
	return {
		ear_mode: features.earMode ?? 'NONE',
		ear_anchor: features.earAnchor ?? 'CENTER',
		protrusions,
		tail_mode: features.tailMode ?? 'NONE',
		tail_segments: features.tailSegments ?? 1,
		snout: (features.snoutWidth ?? 0) > 0,
		snout_width: features.snoutWidth || 3,
		snout_height: features.snoutHeight || 2,
		snout_depth: features.snoutDepth || 3,
		snout_offset: features.snoutOffset ?? 1,
		chest_size: features.chestSize ?? 0,
		wing_mode: features.wingMode ?? 'NONE',
		animate_wings: features.animateWings ?? true,
		cape: features.capeEnabled ?? false,
		emissive: features.emissive ?? false,
	};
}

function buildDialog() {
	const presetOptions = {};
	for (const [id, p] of Object.entries(FEATURE_PRESETS)) presetOptions[id] = p.label;

	const modelOptions = {};
	for (const [id, m] of Object.entries(MODELS)) modelOptions[id] = m.display_name;

	dialog = new Dialog(`${FORMAT_ID}_setup`, {
		title: 'New Ears Skin',
		width: 620,
		form: {
			model: { label: 'Player model', type: 'select', default: 'steve', options: modelOptions },
			texture_source: {
				label: 'Texture',
				type: 'select',
				default: 'template',
				options: { template: 'UV template', blank: 'Blank (transparent)', file: 'Import a PNG…' },
			},
			texture_file: { label: 'Skin file', type: 'file', extensions: ['png'], filetype: 'PNG', condition: (form) => form.texture_source === 'file' },
			// Blockbench checkboxes read `value`, not `default`.
			pose: { label: 'Start in a natural pose', type: 'checkbox', value: true },

			ears_line: '_',
			preset: { label: 'Starting preset', type: 'select', default: 'none', options: presetOptions },
			ears_enabled: { label: 'Ears enabled', type: 'checkbox', value: true },

			ear_mode: { label: 'Ear mode', type: 'select', default: 'NONE', options: EAR_MODES, condition: (form) => form.ears_enabled },
			ear_anchor: { label: 'Ear anchor', type: 'select', default: 'CENTER', options: EAR_ANCHORS, condition: (form) => form.ears_enabled && form.ear_mode !== 'NONE' && form.ear_mode !== 'BEHIND' },
			protrusions: { label: 'Protrusions', type: 'select', default: 'none', options: PROTRUSIONS, condition: (form) => form.ears_enabled },

			tail_mode: { label: 'Tail', type: 'select', default: 'NONE', options: TAIL_MODES, condition: (form) => form.ears_enabled },
			tail_segments: { label: 'Tail segments', type: 'number', default: 1, min: 1, max: 4, step: 1, condition: (form) => form.ears_enabled && form.tail_mode !== 'NONE' },

			snout: { label: 'Snout', type: 'checkbox', value: false, condition: (form) => form.ears_enabled },
			snout_width: { label: 'Snout width', type: 'number', default: 3, min: 1, max: 7, step: 1, condition: (form) => form.ears_enabled && form.snout },
			snout_height: { label: 'Snout height', type: 'number', default: 2, min: 1, max: 4, step: 1, condition: (form) => form.ears_enabled && form.snout },
			snout_depth: { label: 'Snout length', type: 'number', default: 3, min: 1, max: 8, step: 1, condition: (form) => form.ears_enabled && form.snout },
			snout_offset: { label: 'Snout offset', type: 'number', default: 1, min: 0, max: 7, step: 1, condition: (form) => form.ears_enabled && form.snout },

			chest_size: { label: 'Chest size', type: 'number', default: 0, min: 0, max: 1, step: 0.05, condition: (form) => form.ears_enabled },
			wing_mode: { label: 'Wings', type: 'select', default: 'NONE', options: WING_MODES, condition: (form) => form.ears_enabled },
			animate_wings: { label: 'Animate wings', type: 'checkbox', value: true, condition: (form) => form.ears_enabled && form.wing_mode !== 'NONE' },
			cape: { label: 'Cape', type: 'checkbox', value: false, condition: (form) => form.ears_enabled },
			emissive: { label: 'Emissive palette', type: 'checkbox', value: false, condition: (form) => form.ears_enabled },

			format_line: '_',
			data_format: {
				label: 'Data format',
				type: 'select',
				default: 'v0',
				options: { v0: 'v0 — Pixelwise (matches the web tool)', v1: 'v1 — Binary' },
				condition: (form) => form.ears_enabled,
			},
			note: {
				type: 'info',
				text:
					'Ears reads its shapes from unused regions of the skin, so turning a feature on ' +
					'gives you geometry with nothing drawn on it yet. The Ears panel shows exactly ' +
					'which pixels each feature uses once the project is open.',
			},
		},
		onFormChange(form) {
			if (suppressPresetReset) return;
			// Picking a preset fills in the rest of the form.
			if (this.last_preset !== form.preset) {
				this.last_preset = form.preset;
				const preset = FEATURE_PRESETS[form.preset];
				if (preset) {
					suppressPresetReset = true;
					this.setFormValues(featuresToForm({ ...Codec.defaultFeatures(), ...preset.features }), false);
					suppressPresetReset = false;
				}
			}
		},
		onConfirm(form) {
			dialog.hide();
			createProject(form);
		},
	});
	return dialog;
}

// --- project construction --------------------------------------------------

function textureArgument(form) {
	if (form.texture_source === 'file' && form.texture_file) return form.texture_file;
	if (form.texture_source === 'blank') return false;
	return true; // let the codec generate its UV template
}

function createProject(form) {
	const preset = getModel(form.model);

	if (!newProject(Formats[FORMAT_ID])) return;

	Project.name = 'ears_skin';
	Project.skin_model = preset.id;
	Project.skin_slim = preset.slim;
	Project.ears_data_format = form.data_format || 'v0';

	Codecs.skin_model.parse(JSON.parse(preset.model), 1, textureArgument(form), form.pose !== false);

	if (form.texture_source === 'blank') {
		// The codec skips texture creation entirely when told not to build one,
		// but Ears data has to live in a texture, so make an empty one.
		const canvas = document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 64;
		new Texture({ name: 'skin' }).fromDataURL(canvas.toDataURL('image/png')).add(false);
	}

	// The codec builds its template texture from a data URL, so the bitmap isn't
	// there yet -- writing magic pixels now would either no-op or be clobbered
	// when the image finishes loading. Wait for it.
	const features = form.ears_enabled ? formToFeatures(form) : null;
	whenTextureReady((texture) => {
		if (features) applyFeatures(features, Project.ears_data_format, texture);
		Blockbench.dispatchEvent('ears_project_created', { project: Project });
	});
}

function findSkinTexture() {
	if (!Project || !Project.textures) return null;
	return Project.textures.find(
		(t) => !t.ears_role && t.width === 64 && t.height === 64 && t.canvas && t.canvas.width === 64
	) || null;
}

/** Call back once the project has a usable 64x64 skin bitmap. */
function whenTextureReady(callback, attempts = 80) {
	const texture = findSkinTexture();
	if (texture) {
		callback(texture);
		return;
	}
	if (attempts <= 0) {
		console.warn('[Ears] timed out waiting for the skin texture to load');
		return;
	}
	setTimeout(() => whenTextureReady(callback, attempts - 1), 25);
}

/**
 * Write magic pixels into the project's skin texture. Used at project creation;
 * ongoing edits go through the panel.
 */
export function applyFeatures(features, writeFormat = 'v0', target = null) {
	const texture = target || findSkinTexture();
	if (!texture || !texture.ctx) return false;

	const imageData = texture.ctx.getImageData(0, 0, 64, 64);
	if (writeFormat === 'v1') Codec.writeFeatures(imageData, features);
	else CodecV0.writeFeaturesV0(imageData, features);
	texture.ctx.putImageData(imageData, 0, 0);
	texture.updateChangesAfterEdit();
	Blockbench.dispatchEvent('edit_texture', { texture });
	return true;
}

// --- registration ----------------------------------------------------------

let format = null;

export function registerFormat() {
	// Same reasoning as the panel: a reload must not leave a second format (and a
	// second start-screen entry) behind.
	const existing = Formats[FORMAT_ID];
	if (existing) {
		try {
			existing.delete();
		} catch (e) {
			console.warn('[Ears] could not remove the previous format', e);
		}
	}

	buildDialog();

	format = new ModelFormat({
		id: FORMAT_ID,
		name: 'Ears Skin',
		description: 'Minecraft skin with live Ears features',
		icon: 'pets',
		category: 'minecraft',
		target: 'Minecraft: Java Edition',
		show_on_start_screen: true,
		confidential: false,

		// Matches the built-in skin format, which is what makes the native skin
		// editing experience -- box UV, one texture, bone rig, centred grid.
		box_uv: true,
		optional_box_uv: false,
		single_texture: true,
		bone_rig: true,
		centered_grid: true,
		integer_size: true,
		block_size: 16,
		forward_direction: '-z',
		rotate_cubes: false,
		stretch_cubes: false,
		// Ears geometry is built as real Mesh elements so it can be painted in 3D,
		// selected, hidden, moved and deleted like any other part of the model.
		meshes: true,
		locators: false,
		billboards: false,
		bounding_boxes: false,
		texture_meshes: false,
		uv_rotation: false,
		java_face_properties: false,
		cullfaces: false,
		animated_textures: false,
		texture_folder: false,
		can_convert_to: false,
		model_identifier: false,

		// Modes: painting and posing, no animation or display settings -- same as
		// the built-in skin format.
		edit_mode: false,
		paint_mode: true,
		pose_mode: true,
		display_mode: false,
		animation_mode: false,

		format_page: {
			content: [
				{ type: 'h3', text: 'Ears Skin' },
				{
					text:
						'A Minecraft player skin with [Ears](https://ears.y2k.diy) features previewed as real 3D ' +
						'geometry. Set the ears, tail, snout, horns, claws and wings up front, then paint and pose ' +
						'the skin with Blockbench\'s normal tools — the Ears geometry updates as you go.\n\n' +
						'The configuration is stored in the skin\'s own pixels, so exporting the texture is all ' +
						'you need to do; upload it to Mojang and the Ears mod reads it back.',
				},
			],
		},

		new() {
			dialog.show();
			// Re-apply the current preset so the form is consistent on reopen.
			dialog.last_preset = undefined;
			return true;
		},
	});

	return format;
}

export function unregisterFormat() {
	if (dialog) dialog.delete();
	if (format) format.delete();
	dialog = null;
	format = null;
}
