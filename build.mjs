// Bundles src/ with esbuild, then wraps the result together with the vendored
// ears-common.js inside one IIFE.
//
// Order matters: ears-common.js opens with `var initCommon;`, so placing it
// first inside the wrapper makes `initCommon` a local of that scope. bridge.js
// then resolves it as a free variable at runtime -- which also keeps it out of
// `window`, where it would otherwise leak into Blockbench's global namespace.

import { build } from 'esbuild';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const OUT_NAME = 'ears_skin_editor.js';
const outFile = path.join(root, 'dist', OUT_NAME);

const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

const banner = `/*!
 * Ears Skin Editor v${pkg.version} -- a Blockbench plugin
 * https://github.com/${process.env.EARS_REPO || 'HoodedHacker32/blockbench-ears-skin-editor'}
 *
 * Bundles ears-common.js, the TeaVM build of the Ears mod's \`common\` module.
 *   Ears is (c) 2020-2026 Exa Skye and contributors, MIT licensed.
 *   Source: https://git.sleeping.town/exa.mods/Ears
 *   Mirror: https://github.com/exaskye/Ears
 *
 * This plugin is MIT licensed. See LICENSE and vendor/NOTICE.md.
 */`;

const result = await build({
	entryPoints: [path.join(root, 'src', 'index.js')],
	bundle: true,
	format: 'iife',
	target: 'es2020',
	platform: 'browser',
	write: false,
	legalComments: 'none',
	// Blockbench provides these; never try to bundle or rename them.
	define: {},
});

const pluginCode = result.outputFiles[0].text;
const vendorCode = await readFile(path.join(root, 'vendor', 'ears-common.js'), 'utf8');

const bundled = [
	banner,
	'(function () {',
	'"use strict";',
	'// --- vendor: ears-common.js (TeaVM build of Ears common, MIT, Exa Skye) ---',
	vendorCode,
	'// --- plugin ---',
	pluginCode,
	'})();',
	'',
].join('\n');

await mkdir(path.join(root, 'dist'), { recursive: true });
await writeFile(outFile, bundled, 'utf8');

const kb = (bundled.length / 1024).toFixed(0);
console.log(`built dist/${OUT_NAME} (${kb} KB)`);

// `npm run install-local` drops the built plugin straight into Blockbench's
// plugin folder so you can reload it with Ctrl+Shift+I -> Plugins -> Reload.
if (process.argv.includes('--install')) {
	const dirs = [
		path.join(os.homedir(), 'AppData', 'Roaming', 'Blockbench', 'plugins'),
		path.join(os.homedir(), '.local', 'share', 'Blockbench', 'plugins'),
		path.join(os.homedir(), 'Library', 'Application Support', 'Blockbench', 'plugins'),
	];
	const target = dirs.find((d) => existsSync(d));
	if (!target) {
		console.error('could not find a Blockbench plugins folder to install into');
		process.exit(1);
	}
	await copyFile(outFile, path.join(target, OUT_NAME));
	console.log(`installed to ${path.join(target, OUT_NAME)}`);
}

