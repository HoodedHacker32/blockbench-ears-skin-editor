// ---------------------------------------------------------------------------
// Exports a Bedrock skin pack (.mcpack) from one or more Ears skins.
//
// This is the way Ears features can reach Bedrock at all. A Bedrock addon can't
// read magic pixels -- nothing in that pipeline can sample a texture -- but this
// plugin already reads them, so the configuration is resolved here and baked
// into per-skin geometry. The pack travels with the player and is visible to
// everyone, with no world addon required.
// ---------------------------------------------------------------------------

import * as Codec from './codec.js';
import * as CodecV0 from './codec-v0.js';
import { buildGeometry, legacyGeometry } from './bedrock-geometry.js';

/** Bedrock identifiers and .lang keys are far pickier than filenames. */
function slugify(name, fallback) {
	const slug = String(name || '')
		.replace(/\.png$/i, '')
		.replace(/[^A-Za-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
	return slug || fallback;
}

function uuid() {
	if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0;
		return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
	});
}

function decodeToImageData(dataUrl) {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => {
			const canvas = document.createElement('canvas');
			canvas.width = img.naturalWidth;
			canvas.height = img.naturalHeight;
			const ctx = canvas.getContext('2d', { willReadFrequently: true });
			ctx.imageSmoothingEnabled = false;
			ctx.drawImage(img, 0, 0);
			resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
		};
		img.onerror = reject;
		img.src = dataUrl;
	});
}

/** Blockbench hands file content back in more than one shape; normalise it. */
function toDataURL(file) {
	const content = file && file.content;
	if (typeof content === 'string') {
		return content.startsWith('data:') ? content : `data:image/png;base64,${content}`;
	}
	if (!content) return null;
	const bytes = content instanceof Uint8Array ? content : new Uint8Array(content);
	let binary = '';
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
	return `data:image/png;base64,${btoa(binary)}`;
}

/**
 * Read one skin: its pixels, its Ears configuration, and whether we can express
 * that configuration in Bedrock geometry.
 */
export async function inspectSkin(file) {
	const dataUrl = toDataURL(file);
	if (!dataUrl) return { name: file.name, error: 'could not read the file' };

	let imageData;
	try {
		imageData = await decodeToImageData(dataUrl);
	} catch (e) {
		return { name: file.name, error: 'not a readable PNG' };
	}
	if (imageData.width !== 64 || imageData.height !== 64) {
		return { name: file.name, error: `${imageData.width}x${imageData.height}, needs 64x64` };
	}

	const version = Codec.detectFormat(imageData);
	let features = Codec.defaultFeatures();
	if (version === 'v1') features = Codec.readFeatures(imageData) || features;
	else if (version === 'v0') features = CodecV0.readFeaturesV0(imageData);

	return { name: file.name, dataUrl, version, features };
}

/** One-line description of what was found in a skin, for the export dialog. */
export function summarise(result) {
	const { features, version } = result;
	if (!features || version === 'none' || !features.enabled) return 'no Ears data (plain skin)';
	const bits = [];
	if (features.earMode !== 'NONE') bits.push(`${features.earMode.toLowerCase().replace('_', ' ')} ears`);
	if (features.tailMode !== 'NONE') {
		bits.push(`${features.tailMode.toLowerCase().replace('_', ' ')} tail x${features.tailSegments || 1}`);
	}
	if (features.snoutWidth > 0) {
		bits.push(`snout ${features.snoutWidth}x${features.snoutHeight}x${features.snoutDepth}`);
	}
	if (features.claws) bits.push('claws');
	if (features.horn) bits.push('horn');
	if (features.wingMode && features.wingMode !== 'NONE') bits.push('wings');
	return bits.length ? `${version} — ${bits.join(', ')}` : `${version} — nothing enabled`;
}

/**
 * Assemble the .mcpack.
 *
 * @param skins    results from inspectSkin, already filtered to the valid ones
 * @param options  { packName, slim }
 */
export async function buildPack(skins, options) {
	const packName = options.packName || 'Ears Skins';
	const slug = slugify(packName, 'EarsSkins');
	const zip = new JSZip();

	// Legacy 1.8.0 layout: each geometry is a top-level key on this object.
	const geometryFile = { format_version: '1.8.0' };
	const skinEntries = [];
	const lang = [`pack.name=${packName}`, `pack.description=Ears skins with baked geometry`, `skinpack.${slug}=${packName}`];
	const notes = [];

	const used = new Set();
	skins.forEach((skin, index) => {
		let id = slugify(skin.name, `Skin${index + 1}`);
		while (used.has(id)) id = `${id}_${index + 1}`;
		used.add(id);

		// One dotted segment only. Bedrock reads `geometry.a:geometry.b` as
		// inheritance, so keep these plain and unambiguous.
		const identifier = `geometry.${slug}_${id}`;
		const { bones, unsupported } = buildGeometry(skin.features, { slim: options.slim });
		geometryFile[identifier] = legacyGeometry(bones);

		const fileName = `${id}.png`;
		zip.file(fileName, skin.dataUrl.split(',')[1], { base64: true });

		skinEntries.push({
			localization_name: id,
			geometry: identifier,
			texture: fileName,
			type: 'free',
		});
		lang.push(`skin.${slug}.${id}=${skin.name.replace(/\.png$/i, '')}`);

		if (unsupported.length) notes.push(`${skin.name}: ${unsupported.join(', ')} not represented`);
	});

	zip.file('manifest.json', JSON.stringify({
		format_version: 1,
		header: {
			name: 'pack.name',
			uuid: uuid(),
			version: [1, 0, 0],
		},
		modules: [{ type: 'skin_pack', uuid: uuid(), version: [1, 0, 0] }],
	}, null, 2));

	zip.file('skins.json', JSON.stringify({
		skins: skinEntries,
		serialize_name: slug,
		localization_name: slug,
	}, null, 2));

	zip.file('geometry.json', JSON.stringify(geometryFile, null, 2));

	zip.file('texts/en_US.lang', lang.join('\n') + '\n');

	const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
	return { blob, notes, count: skinEntries.length, slug };
}
