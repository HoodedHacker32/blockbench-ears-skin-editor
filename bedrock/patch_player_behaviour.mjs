// Adds the Ears entity properties to Minecraft's own player.json.
//
// Same reasoning as patch_player_entity.mjs: player.json carries every gameplay
// component the player has, so it's patched rather than written from scratch.
//
//   node patch_player_behaviour.mjs <vanilla player.json>
//
// Vanilla file: https://github.com/Mojang/bedrock-samples
//   -> behavior_pack/entities/player.json
//
// client_sync is what lets a render controller / pre_animation script see the
// value; without it the property exists only on the server and the model can't
// react to it.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const input = process.argv[2];
if (!input) {
	console.error('usage: node patch_player_behaviour.mjs <vanilla player.json>');
	process.exit(1);
}

const json = JSON.parse(await readFile(input, 'utf8'));
const desc = json['minecraft:entity']?.description;
if (!desc) {
	console.error('That does not look like a behaviour entity file (no minecraft:entity.description).');
	process.exit(1);
}

desc.properties = desc.properties || {};
Object.assign(desc.properties, {
	'ears:mode':  { type: 'int', range: [0, 2], default: 0, client_sync: true },
	'ears:tail':  { type: 'int', range: [0, 3], default: 0, client_sync: true },
	'ears:snout': { type: 'int', range: [0, 1], default: 0, client_sync: true },
});

const out = path.join('ears_bp', 'entities', 'player.json');
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(json, null, 2) + '\n', 'utf8');
console.log(`wrote ${out}`);
console.log('  added properties: ears:mode, ears:tail, ears:snout');
