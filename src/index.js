// ---------------------------------------------------------------------------
// Ears Skin Editor -- a Blockbench plugin
//
// Edits the Ears "magic pixels" in a Minecraft skin and previews the resulting
// ears/tail/snout/wings/horns as real 3D geometry, attached to the player model
// so it follows posing and animation.
//
// Geometry comes from the actual Ears implementation: the vendored
// ears-common.js is Exa Skye's `common` module compiled to JS with TeaVM, the
// same build the official web Manipulator runs on. That means the preview is
// the mod's own renderer, not a reimplementation of it.
// ---------------------------------------------------------------------------

import * as Bridge from './bridge.js';
import * as Codec from './codec.js';
import * as CodecV0 from './codec-v0.js';
import * as Skin from './skin.js';
import * as Regions from './regions.js';
import * as Fmt from './format.js';
import * as MeshBuilder from './meshbuilder.js';
import { EarsPreview } from './renderer.js';

const PLUGIN_ID = 'ears_skin_editor';
const FORMATS = ['skin', Fmt.FORMAT_ID];

const state = {
	preview: null,
	panel: null,
	skinCanvas: null,
	wingCanvas: null,
	capeCanvas: null,
	alfalfa: { version: 1, data: {} },
	suspend: false,
	refreshQueued: false,
};

const vm = {
	available: false,
	format: 'none', // 'none' | 'v0' | 'v1'
	writeFormat: 'v0',
	features: Codec.defaultFeatures(),
	slim: false,
	jacket: true,
	missingParts: [],
	hasWing: false,
	hasCape: false,
	editingWing: false,
	editingCape: false,
	commonVersion: '',
	notices: [],
	regions: [],
	regionSummary: { count: 0, total: 0, empty: 0 },
	showRegions: false,
	paintable: false,
	meshStats: null,
};

// --- reading / writing -----------------------------------------------------

function isSkinProject() {
	return !!(Project && Format && FORMATS.includes(Format.id));
}

function detectSlim() {
	// The slim preset uses 3-wide arms.
	for (const group of Group.all) {
		const name = String(group.name || '').toLowerCase();
		if (name === 'right arm' || name === 'left arm') {
			const cube = (group.children || []).find((c) => c instanceof Cube);
			if (cube) return Math.abs(cube.to[0] - cube.from[0]) < 3.5;
		}
	}
	return false;
}

function jacketVisible() {
	for (const cube of Cube.all) {
		if (String(cube.name || '').toLowerCase().includes('body layer')) return cube.visibility !== false;
	}
	return true;
}

/** Re-read the skin and rebuild both the panel state and the 3D preview. */
function refresh() {
	state.refreshQueued = false;
	if (!isSkinProject()) {
		vm.available = false;
		if (state.preview) state.preview.clear();
		return;
	}

	const texture = Skin.getSkinTexture();
	if (!texture) {
		vm.available = false;
		if (state.preview) state.preview.clear();
		return;
	}
	vm.available = true;

	const imageData = Skin.readImageData(texture);
	if (!imageData) return;

	vm.format = Codec.detectFormat(imageData);
	if (vm.format === 'v1') {
		const parsed = Codec.readFeatures(imageData);
		if (parsed) vm.features = parsed;
		vm.writeFormat = 'v1';
	} else if (vm.format === 'v0') {
		vm.features = CodecV0.readFeaturesV0(imageData);
		vm.writeFormat = 'v0';
	} else {
		vm.features.enabled = false;
	}

	vm.slim = detectSlim();
	vm.jacket = jacketVisible();

	const { objects, alfalfa } = Bridge.buildQuads(imageData, { slim: vm.slim, jacket: vm.jacket });
	state.alfalfa = alfalfa;
	vm.hasWing = !!alfalfa.data.wing;
	vm.hasCape = !!alfalfa.data.cape;
	vm.commonVersion = Bridge.commonVersion() || '';

	state.skinCanvas = Skin.cloneToCanvas(texture, state.skinCanvas);
	state.preview.setTexture('skin', state.skinCanvas);
	state.preview.setTexture('emissive_skin', state.skinCanvas);

	// Real Mesh elements are what make the geometry paintable, but they're only
	// available in formats that allow meshes. Elsewhere everything stays on the
	// read-only overlay.
	const useMeshes = !!(Format && Format.meshes);
	vm.paintable = useMeshes;

	// Geometry only depends on the Ears configuration, not on the pixels. Painting
	// changes the texture, which the meshes already reference -- so rebuilding on
	// every brush stroke would be wasted work that also throws away any manual
	// edits made to the generated geometry.
	// Keyed by project as well as config: two projects can share an identical Ears
	// setup, and without the uuid switching between them would skip the rebuild
	// and leave the newly-selected one with no geometry.
	const fingerprint = JSON.stringify([
		Project.uuid,
		vm.features,
		vm.slim,
		vm.jacket,
		vm.hasWing,
		vm.hasCape,
		useMeshes,
	]);
	const geometryChanged = fingerprint !== state.fingerprint;
	state.fingerprint = fingerprint;

	if (useMeshes) {
		// Wing and cape quads sample 20x16 textures, which don't map onto the
		// project's 64x64 UV space, so those keep using the overlay.
		state.preview.build(objects, (o) => o.texture !== 'skin' && o.texture !== 'emissive_skin');
		if (geometryChanged) {
			const result = MeshBuilder.buildMeshes(objects, texture);
			vm.meshStats = result;
		}
	} else {
		state.preview.build(objects);
		vm.meshStats = null;
	}
	vm.missingParts = Array.from(state.preview.missingParts);

	state.regions = Regions.computeRegions(objects);
	vm.regions = state.regions.filter((r) => r.texture === 'skin');
	vm.regionSummary = Regions.summarise(state.regions, imageData);

	updateNotices();
	syncAuxTextures();
	Canvas.updateView({ elements: [], selection: false });
}

function queueRefresh() {
	if (state.suspend || state.refreshQueued) return;
	state.refreshQueued = true;
	setTimeout(refresh, 0);
}

/** Write the current panel state back into the skin's magic pixels. */
function commit(undoName = 'Edit Ears settings') {
	const texture = Skin.getSkinTexture();
	if (!texture) return;

	state.suspend = true;
	const ok = Skin.editTexture(
		texture,
		(imageData) => {
			if (!vm.features.enabled) {
				Codec.clearFeatures(imageData);
			} else if (vm.writeFormat === 'v1') {
				Codec.writeFeatures(imageData, vm.features);
			} else {
				CodecV0.writeFeaturesV0(imageData, vm.features);
			}
		},
		undoName
	);
	state.suspend = false;
	if (ok) refresh();
}

/** Push the current Alfalfa payload into the skin's alpha channel. */
function commitAlfalfa(undoName = 'Edit Ears wing/cape data') {
	const texture = Skin.getSkinTexture();
	if (!texture) return;

	state.suspend = true;
	const ok = Skin.editTexture(
		texture,
		(imageData) => Bridge.writeAlfalfa(imageData, state.alfalfa),
		undoName
	);
	state.suspend = false;
	if (ok) refresh();
}

/**
 * Paint a placeholder into the Ears regions that are still fully transparent,
 * so every enabled feature becomes visible and can be painted over.
 */
function fillRegions(onlyEmpty) {
	const texture = Skin.getSkinTexture();
	if (!texture || !state.regions.length) return;

	let painted = 0;
	state.suspend = true;
	const ok = Skin.editTexture(
		texture,
		(imageData) => {
			painted = Regions.fillEmptyRegions(imageData, state.regions, { onlyEmpty });
		},
		onlyEmpty ? 'Fill empty Ears regions' : 'Fill Ears regions'
	);
	state.suspend = false;
	if (ok) {
		Blockbench.showQuickMessage(`Painted ${painted} pixel${painted === 1 ? '' : 's'}`, 2000);
		refresh();
	}
}

/**
 * Force the generated geometry to be rebuilt from the magic pixels. Needed
 * because the meshes are freely editable -- once you've moved or deleted some,
 * there has to be a way back.
 */
function rebuildGeometry() {
	state.fingerprint = null;
	refresh();
	const stats = vm.meshStats;
	if (stats) {
		Blockbench.showQuickMessage(
			`Rebuilt ${stats.faces} face${stats.faces === 1 ? '' : 's'} across ${stats.meshes} mesh${stats.meshes === 1 ? '' : 'es'}`,
			2000
		);
	}
}

function updateNotices() {
	const notices = [];
	const f = vm.features;
	if (f.enabled) {
		if (f.wingMode !== 'NONE' && !vm.hasWing) {
			notices.push('Wings are enabled but no wing texture is stored in this skin, so Ears will disable them. Import a 20x16 wing image below.');
		}
		if (f.capeEnabled && !vm.hasCape) {
			notices.push('The cape flag is set but no cape texture is stored in this skin.');
		}
		if (f.tailMode === 'NONE' && f.tailSegments > 1) {
			notices.push('Tail segments only apply when a tail mode is selected.');
		}
	}
	if (vm.missingParts.length) {
		notices.push(`This project has no bone for: ${vm.missingParts.join(', ')}. Those features can't be previewed.`);
	}
	if (vm.features.enabled && vm.regionSummary.empty > 0 && vm.regionSummary.empty === vm.regionSummary.total) {
		notices.push('None of the texture regions these features read from have been drawn yet, so nothing will show in game. Use "Fill empty regions" below to see where to paint.');
	}
	vm.notices = notices;
}

// --- wing / cape textures --------------------------------------------------

const AUX_ROLES = {
	wing: { role: Skin.WING_TEXTURE_NAME, label: 'Ears Wing' },
	cape: { role: Skin.CAPE_TEXTURE_NAME, label: 'Ears Cape' },
};

/**
 * Decode the stored wing/cape PNGs into preview textures. If the user has
 * opted into editing one as a project texture, refresh that too.
 */
async function syncAuxTextures() {
	for (const [key, { role, label }] of Object.entries(AUX_ROLES)) {
		const bytes = state.alfalfa.data[key];
		if (!bytes) {
			state.preview.setTexture(key, null);
			state.preview.setTexture(`emissive_${key}`, null);
			continue;
		}
		try {
			const canvas = await Skin.decodePng(bytes);
			if (!canvas) continue;
			if (key === 'wing') state.wingCanvas = canvas;
			else state.capeCanvas = canvas;
			state.preview.setTexture(key, canvas);
			state.preview.setTexture(`emissive_${key}`, canvas);

			// Only refresh an editable copy that already exists -- adding one is
			// opt-in, so we never surprise a skin project with extra textures.
			if (Skin.getAuxTexture(role)) await Skin.upsertAuxTexture(role, canvas, label);
		} catch (e) {
			console.error(`[Ears] could not decode the ${key} image`, e);
		}
	}
	vm.editingWing = !!Skin.getAuxTexture(AUX_ROLES.wing.role);
	vm.editingCape = !!Skin.getAuxTexture(AUX_ROLES.cape.role);
	Canvas.updateView({ elements: [], selection: false });
}

/** Add the wing/cape to the project as a paintable texture. */
async function editAuxInProject(key) {
	const bytes = state.alfalfa.data[key];
	if (!bytes) return;
	const canvas = await Skin.decodePng(bytes);
	if (!canvas) return;
	const { role, label } = AUX_ROLES[key];
	const texture = await Skin.upsertAuxTexture(role, canvas, label);
	texture.select();
	Blockbench.showQuickMessage(`${label} added to the texture list — paint it and the skin updates`, 3000);
	vm[key === 'wing' ? 'editingWing' : 'editingCape'] = true;
}

function stopEditingAux(key) {
	Skin.removeAuxTexture(AUX_ROLES[key].role);
	vm[key === 'wing' ? 'editingWing' : 'editingCape'] = false;
}

async function importAux(key) {
	const expect = key === 'wing' ? '20x16 (or a legacy 12x12)' : 'any size, 20x16 recommended';
	Blockbench.import(
		{ extensions: ['png'], type: 'PNG', readtype: 'buffer', title: `Import Ears ${key} image (${expect})` },
		async (files) => {
			if (!files.length) return;
			const bytes = new Uint8Array(files[0].content);
			const canvas = await Skin.decodePng(bytes).catch(() => null);
			if (!canvas) return Blockbench.showQuickMessage('Could not read that PNG', 2000);
			if (key === 'wing' && !((canvas.width === 20 && canvas.height === 16) || (canvas.width === 12 && canvas.height === 12))) {
				return Blockbench.showMessageBox({
					title: 'Wrong wing size',
					message: `Ears wings must be 20x16, or 12x12 for legacy skins. That image is ${canvas.width}x${canvas.height}.`,
				});
			}
			state.alfalfa.version = state.alfalfa.version || 1;
			state.alfalfa.data[key] = bytes;
			commitAlfalfa(`Import Ears ${key}`);
		}
	);
}

function removeAux(key) {
	delete state.alfalfa.data[key];
	Skin.removeAuxTexture(AUX_ROLES[key].role);
	commitAlfalfa(`Remove Ears ${key}`);
}

function exportAux(key) {
	const bytes = state.alfalfa.data[key];
	if (!bytes) return;
	Blockbench.export({
		type: 'PNG',
		extensions: ['png'],
		name: `ears_${key}`,
		content: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
		savetype: 'buffer',
	});
}

/** Re-encode a painted wing/cape project texture back into the skin. */
async function pushAuxTexture(texture) {
	const key = texture.ears_role === Skin.WING_TEXTURE_NAME ? 'wing' : 'cape';
	const canvas = Skin.cloneToCanvas(texture);
	try {
		state.alfalfa.data[key] = await Skin.encodePng(canvas);
		commitAlfalfa(`Update Ears ${key}`);
	} catch (e) {
		console.error('[Ears] could not re-encode the painted image', e);
	}
}

// --- panel -----------------------------------------------------------------

const SELECT_OPTIONS = {
	earMode: [
		['NONE', 'None'], ['ABOVE', 'Above'], ['SIDES', 'Sides'], ['OUT', 'Out'], ['AROUND', 'Around'],
		['FLOPPY', 'Floppy'], ['CROSS', 'Cross'], ['TALL', 'Tall'], ['TALL_CROSS', 'Tall Cross'],
		['BEHIND', 'Behind (old, prefer Out)'],
	],
	earAnchor: [['CENTER', 'Center'], ['FRONT', 'Front'], ['BACK', 'Back']],
	tailMode: [
		['NONE', 'None'], ['DOWN', 'Down'], ['BACK', 'Back'], ['UP', 'Up'], ['VERTICAL', 'Vertical'],
		['CROSS', 'Cross'], ['CROSS_OVERLAP', 'Overlapping Cross'], ['STAR', 'Star'], ['STAR_OVERLAP', 'Overlapping Star'],
	],
	wingMode: [
		['NONE', 'None'], ['SYMMETRIC_DUAL', 'Symmetric Dual'], ['SYMMETRIC_SINGLE', 'Symmetric Single'],
		['ASYMMETRIC_L', 'Asymmetric Single (Left)'], ['ASYMMETRIC_R', 'Asymmetric Single (Right)'],
		['ASYMMETRIC_DUAL', 'Asymmetric Dual'], ['FLAT', 'Flat'],
	],
};

function buildPanel() {
	// Reloading the plugin (or loading it twice) would otherwise stack a second
	// panel on top of the first. The old one keeps its own dead module state, so
	// it just sits there looking broken -- drop it before building ours.
	const existing = Panels[PLUGIN_ID];
	if (existing) {
		try {
			existing.delete();
		} catch (e) {
			console.warn('[Ears] could not remove the previous panel', e);
		}
	}

	state.panel = new Panel(PLUGIN_ID, {
		name: 'Ears',
		id: PLUGIN_ID,
		icon: 'pets',
		growable: true,
		condition: { formats: FORMATS },
		default_position: { slot: 'right_bar', float_position: [0, 0], float_size: [340, 700], height: 560 },
		component: {
			name: 'ears-panel',
			data: () => ({ vm, options: SELECT_OPTIONS }),
			methods: {
				commit: (name) => commit(name),
				importAux: (key) => importAux(key),
				removeAux: (key) => removeAux(key),
				exportAux: (key) => exportAux(key),
				editAux: (key) => editAuxInProject(key),
				stopEditingAux: (key) => stopEditingAux(key),
				fillRegions: (onlyEmpty) => fillRegions(onlyEmpty),
				rebuildGeometry: () => rebuildGeometry(),
				openManipulator: () => Blockbench.openLink('https://ears.y2k.diy/manipulator/'),
				toggleEnabled() {
					vm.features.enabled = !vm.features.enabled;
					commit(vm.features.enabled ? 'Enable Ears' : 'Disable Ears');
				},
				setFormat(fmt) {
					vm.writeFormat = fmt;
					commit('Change Ears data format');
				},
				bendLabel: (i) => `Segment ${i + 1}`,
			},
			template: `
				<div class="ears_panel">
					<div v-if="!vm.available" class="ears_empty">
						Open a 64x64 Minecraft Skin project to edit Ears data.
					</div>
					<template v-else>
						<div class="ears_row ears_header">
							<label class="ears_check">
								<input type="checkbox" :checked="vm.features.enabled" @change="toggleEnabled()"/>
								<span>Ears enabled</span>
							</label>
							<span class="ears_badge" :title="'Magic pixel format found in this skin'">
								{{ vm.format === 'none' ? 'no data' : vm.format }}
							</span>
						</div>

						<div v-for="n in vm.notices" class="ears_notice">{{ n }}</div>

						<fieldset :disabled="!vm.features.enabled" class="ears_body">
							<h4>Ears</h4>
							<div class="ears_row">
								<label>Mode</label>
								<select v-model="vm.features.earMode" @change="commit('Change ear mode')">
									<option v-for="o in options.earMode" :value="o[0]">{{ o[1] }}</option>
								</select>
							</div>
							<div class="ears_row" v-if="vm.features.earMode !== 'NONE' && vm.features.earMode !== 'BEHIND'">
								<label>Anchor</label>
								<select v-model="vm.features.earAnchor" @change="commit('Change ear anchor')">
									<option v-for="o in options.earAnchor" :value="o[0]">{{ o[1] }}</option>
								</select>
							</div>

							<h4>Protrusions</h4>
							<div class="ears_row">
								<label class="ears_check">
									<input type="checkbox" v-model="vm.features.claws" @change="commit('Toggle claws')"/> Claws
								</label>
								<label class="ears_check">
									<input type="checkbox" v-model="vm.features.horn" @change="commit('Toggle horn')"/> Horn
								</label>
							</div>

							<h4>Tail</h4>
							<div class="ears_row">
								<label>Mode</label>
								<select v-model="vm.features.tailMode" @change="commit('Change tail mode')">
									<option v-for="o in options.tailMode" :value="o[0]">{{ o[1] }}</option>
								</select>
							</div>
							<template v-if="vm.features.tailMode !== 'NONE'">
								<div class="ears_row">
									<label>Segments</label>
									<input type="range" min="1" max="4" step="1" v-model.number="vm.features.tailSegments" @change="commit('Change tail segments')"/>
									<span class="ears_value">{{ vm.features.tailSegments }}</span>
								</div>
								<div class="ears_row" v-for="i in vm.features.tailSegments">
									<label>{{ bendLabel(i - 1) }}</label>
									<input type="range" min="-90" max="90" step="1"
										v-model.number="vm.features['tailBend' + (i - 1)]"
										@change="commit('Change tail bend')"/>
									<span class="ears_value">{{ Math.round(vm.features['tailBend' + (i - 1)]) }}&deg;</span>
								</div>
							</template>

							<h4>Snout</h4>
							<div class="ears_row">
								<label>Width</label>
								<input type="range" min="0" max="7" step="1" v-model.number="vm.features.snoutWidth" @change="commit('Change snout')"/>
								<span class="ears_value">{{ vm.features.snoutWidth || 'off' }}</span>
							</div>
							<template v-if="vm.features.snoutWidth > 0">
								<div class="ears_row">
									<label>Height</label>
									<input type="range" min="1" max="4" step="1" v-model.number="vm.features.snoutHeight" @change="commit('Change snout')"/>
									<span class="ears_value">{{ vm.features.snoutHeight }}</span>
								</div>
								<div class="ears_row">
									<label>Length</label>
									<input type="range" min="1" max="8" step="1" v-model.number="vm.features.snoutDepth" @change="commit('Change snout')"/>
									<span class="ears_value">{{ vm.features.snoutDepth }}</span>
								</div>
								<div class="ears_row">
									<label>Offset</label>
									<input type="range" min="0" :max="8 - vm.features.snoutHeight" step="1" v-model.number="vm.features.snoutOffset" @change="commit('Change snout')"/>
									<span class="ears_value">{{ vm.features.snoutOffset }}</span>
								</div>
							</template>

							<h4>Chest</h4>
							<div class="ears_row">
								<label>Size</label>
								<input type="range" min="0" max="1" step="0.05" v-model.number="vm.features.chestSize" @change="commit('Change chest size')"/>
								<span class="ears_value">{{ Math.round(vm.features.chestSize * 100) }}%</span>
							</div>

							<h4>Wings</h4>
							<div class="ears_row">
								<label>Mode</label>
								<select v-model="vm.features.wingMode" @change="commit('Change wing mode')">
									<option v-for="o in options.wingMode" :value="o[0]">{{ o[1] }}</option>
								</select>
							</div>
							<div class="ears_row" v-if="vm.features.wingMode !== 'NONE'">
								<label class="ears_check">
									<input type="checkbox" v-model="vm.features.animateWings" @change="commit('Toggle wing animation')"/> Animate wings
								</label>
							</div>
							<div class="ears_row ears_buttons">
								<button @click="importAux('wing')">{{ vm.hasWing ? 'Replace' : 'Import' }}</button>
								<button v-if="vm.hasWing" @click="exportAux('wing')">Export</button>
								<button v-if="vm.hasWing" @click="removeAux('wing')">Remove</button>
							</div>
							<div class="ears_row ears_buttons" v-if="vm.hasWing">
								<button v-if="!vm.editingWing" @click="editAux('wing')">Paint wing in Blockbench</button>
								<button v-else @click="stopEditingAux('wing')">Done painting wing</button>
							</div>

							<h4>Cape</h4>
							<div class="ears_row">
								<label class="ears_check">
									<input type="checkbox" v-model="vm.features.capeEnabled" @change="commit('Toggle cape')"/> Cape enabled
								</label>
							</div>
							<div class="ears_row ears_buttons">
								<button @click="importAux('cape')">{{ vm.hasCape ? 'Replace' : 'Import' }}</button>
								<button v-if="vm.hasCape" @click="exportAux('cape')">Export</button>
								<button v-if="vm.hasCape" @click="removeAux('cape')">Remove</button>
							</div>
							<div class="ears_row ears_buttons" v-if="vm.hasCape">
								<button v-if="!vm.editingCape" @click="editAux('cape')">Paint cape in Blockbench</button>
								<button v-else @click="stopEditingAux('cape')">Done painting cape</button>
							</div>

							<h4>Other</h4>
							<div class="ears_row">
								<label class="ears_check">
									<input type="checkbox" v-model="vm.features.emissive" @change="commit('Toggle emissive')"/> Emissive palette
								</label>
							</div>
							<div class="ears_row">
								<label>Write as</label>
								<select :value="vm.writeFormat" @change="setFormat($event.target.value)">
									<option value="v0">v0 (Pixelwise, matches the web tool)</option>
									<option value="v1">v1 (Binary)</option>
								</select>
							</div>
						</fieldset>

						<template v-if="vm.features.enabled && vm.regions.length">
							<h4 @click="vm.showRegions = !vm.showRegions" class="ears_clickable">
								Texture regions
								<span class="ears_badge">{{ vm.regionSummary.empty }} / {{ vm.regionSummary.total }} px undrawn</span>
							</h4>
							<div class="ears_hint">
								These are the pixels your current features read from — derived from the
								geometry, so it's exactly what Ears will sample.
							</div>
							<div class="ears_row ears_buttons">
								<button @click="fillRegions(true)" title="Paint a placeholder into regions that are still fully transparent">Fill empty regions</button>
								<button @click="vm.showRegions = !vm.showRegions">{{ vm.showRegions ? 'Hide list' : 'Show list' }}</button>
							</div>
							<ul v-if="vm.showRegions" class="ears_regions">
								<li v-for="r in vm.regions">
									<code>{{ r.x }}, {{ r.y }}</code> &mdash; {{ r.w }}&times;{{ r.h }}
								</li>
							</ul>
						</template>

						<template v-if="vm.features.enabled">
							<h4>Geometry</h4>
							<div class="ears_hint" v-if="vm.paintable">
								Built as real mesh elements, so you can paint them in 3D and select,
								hide, move or delete them like any other part. Changing a setting above
								regenerates them.
							</div>
							<div class="ears_hint" v-else>
								This project's format doesn't allow mesh elements, so the Ears geometry
								is a read-only preview. Create an <b>Ears Skin</b> project to paint it in 3D.
							</div>
							<div class="ears_row ears_buttons" v-if="vm.paintable">
								<button @click="rebuildGeometry()">Rebuild Ears geometry</button>
							</div>
							<div class="ears_hint" v-if="vm.meshStats && vm.meshStats.skipped">
								{{ vm.meshStats.skipped }} wing/cape quad(s) stay as a read-only preview —
								they sample a 20&times;16 texture, which doesn't fit this project's UV space.
							</div>
						</template>

						<div class="ears_footer">
							Geometry by ears-common {{ vm.commonVersion }} &middot;
							<a href="#" @click.prevent="openManipulator()">web manipulator</a>
						</div>
					</template>
				</div>
			`,
		},
	});
}

const PANEL_CSS = `
	.ears_panel { padding: 8px; font-size: 13px; }
	.ears_panel h4 { margin: 12px 0 4px; padding-bottom: 2px; border-bottom: 1px solid var(--color-border); color: var(--color-light); }
	.ears_panel fieldset { border: none; margin: 0; padding: 0; min-width: 0; }
	.ears_panel fieldset[disabled] { opacity: 0.45; pointer-events: none; }
	.ears_row { display: flex; align-items: center; gap: 6px; margin: 4px 0; }
	.ears_row > label:first-child { flex: 0 0 72px; color: var(--color-text); }
	.ears_row select, .ears_row input[type=range] { flex: 1 1 auto; min-width: 0; }
	.ears_value { flex: 0 0 42px; text-align: right; color: var(--color-subtle_text); font-variant-numeric: tabular-nums; }
	.ears_check { display: flex; align-items: center; gap: 4px; flex: 0 0 auto; }
	.ears_header { justify-content: space-between; border-bottom: 1px solid var(--color-border); padding-bottom: 6px; }
	.ears_badge { background: var(--color-button); border-radius: 3px; padding: 1px 6px; font-size: 11px; color: var(--color-subtle_text); }
	.ears_notice { background: var(--color-back); border-left: 3px solid var(--color-accent); padding: 5px 7px; margin: 6px 0; font-size: 12px; color: var(--color-subtle_text); }
	.ears_buttons { gap: 4px; }
	.ears_buttons button { flex: 1 1 auto; }
	.ears_empty { padding: 16px; text-align: center; color: var(--color-subtle_text); }
	.ears_clickable { cursor: pointer; display: flex; justify-content: space-between; align-items: baseline; gap: 6px; }
	.ears_hint { font-size: 11px; color: var(--color-subtle_text); margin: 2px 0 6px; }
	.ears_regions { margin: 4px 0 0; padding: 0 0 0 4px; list-style: none; max-height: 160px; overflow-y: auto; font-size: 12px; }
	.ears_regions li { padding: 1px 0; color: var(--color-subtle_text); }
	.ears_regions code { color: var(--color-light); font-variant-numeric: tabular-nums; }
	.ears_footer { margin-top: 12px; padding-top: 6px; border-top: 1px solid var(--color-border); font-size: 11px; color: var(--color-subtle_text); }
`;

// --- plugin lifecycle ------------------------------------------------------

const listeners = {};

function on(event, handler) {
	listeners[event] = handler;
	Blockbench.on(event, handler);
}

function onTextureEdited(data) {
	if (state.suspend) return;
	const texture = data && (data.texture || (data.textures && data.textures[0]));
	if (texture && texture.ears_role) {
		pushAuxTexture(texture);
		return;
	}
	queueRefresh();
}

Plugin.register(PLUGIN_ID, {
	title: 'Ears Skin Editor',
	author: 'HoodedHacker',
	description:
		"Edit a skin's Ears magic pixels and see the ears, tail, snout, horns and wings as live 3D " +
		'geometry on the player model. Rendering is driven by Ears\' own common module, so the ' +
		'preview matches the mod exactly.',
	icon: 'pets',
	version: '1.0.0',
	variant: 'both',
	tags: ['Minecraft: Java Edition', 'Skins', 'Ears'],
	min_version: '4.10.0',

	onload() {
		state.css = Blockbench.addCSS(PANEL_CSS);
		if (!Bridge.init()) {
			Blockbench.showMessageBox({
				title: 'Ears Skin Editor',
				message: 'ears-common failed to initialise, so the 3D preview is unavailable. See the dev console for details.',
			});
		}
		state.preview = new EarsPreview();
		Fmt.registerFormat();
		Fmt.patchSkinActions();
		buildPanel();

		on('select_project', queueRefresh);
		on('load_project', queueRefresh);
		on('new_project', queueRefresh);
		on('finished_edit', queueRefresh);
		on('edit_texture', onTextureEdited);
		on('add_texture', queueRefresh);
		on('update_texture_selection', queueRefresh);
		on('undo', queueRefresh);
		on('redo', queueRefresh);
		on('update_visibility', queueRefresh);

		queueRefresh();
	},

	onunload() {
		for (const [event, handler] of Object.entries(listeners)) Blockbench.removeListener(event, handler);
		Fmt.unpatchSkinActions();
		Fmt.unregisterFormat();
		if (state.preview) state.preview.dispose();
		if (state.panel) state.panel.delete();
		if (state.css && state.css.delete) state.css.delete();
		else if (state.css && state.css.remove) state.css.remove();
		state.preview = null;
		state.panel = null;
		state.css = null;
	},
});
