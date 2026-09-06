// Injects the Ears geometry and feature animation into Minecraft's own
// player.entity.json.
//
// The vanilla file is long, version-specific, and drives every player animation
// there is -- writing one from scratch would break far more than it fixed. So
// this patches the real file from your game version instead.
//
//   node patch_player_entity.mjs <vanilla player.entity.json> [config]
//
// Get the vanilla file from Mojang's sample resource pack:
//   https://github.com/Mojang/bedrock-samples  ->  resource_pack/entity/player.entity.json
//
// config is optional, as ears=N,tail=N,snout=N. Defaults to ears=1,tail=1,snout=0.
//   ears : 0 none, 1 above, 2 sides
//   tail : 0 none, 1 down, 2 back, 3 up
//   snout: 0 off, 1 on

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const [, , input, configArg] = process.argv;
if (!input) {
	console.error('usage: node patch_player_entity.mjs <vanilla player.entity.json> [ears=1,tail=1,snout=0]');
	process.exit(1);
}

const config = { ears: 1, tail: 1, snout: 0 };
for (const pair of (configArg || '').split(',').filter(Boolean)) {
	const [k, v] = pair.split('=');
	if (k in config) config[k] = Number(v) || 0;
}

const json = JSON.parse(await readFile(input, 'utf8'));
const desc = json['minecraft:client_entity']?.description;
if (!desc) {
	console.error('That does not look like a client entity file (no minecraft:client_entity.description).');
	process.exit(1);
}

// Point the default geometry at ours. Anything else (cape, etc.) is left alone.
desc.geometry = desc.geometry || {};
const replaced = desc.geometry.default;
desc.geometry.default = 'geometry.ears_player';

desc.animations = desc.animations || {};
desc.animations.ears_features = 'animation.ears.features';

desc.scripts = desc.scripts || {};
desc.scripts.animate = desc.scripts.animate || [];
if (!desc.scripts.animate.some((a) => a === 'ears_features' || (typeof a === 'object' && 'ears_features' in a))) {
	desc.scripts.animate.push('ears_features');
}

// pre_animation runs before the animation is evaluated, so this is where the
// configuration is chosen. Swap these for query.property(...) if you add a
// behaviour pack that gives the player entity properties.
desc.scripts.pre_animation = (desc.scripts.pre_animation || []).filter((l) => !String(l).includes('v.ears_'));
if (configArg === "properties") {
	// Driven per player by the behaviour pack instead of fixed for everyone.
	desc.scripts.pre_animation.push(
		"v.ears_mode = q.property('ears:mode');",
		"v.ears_tail = q.property('ears:tail');",
		"v.ears_snout = q.property('ears:snout');"
	);
} else {
	desc.scripts.pre_animation.push(
		`v.ears_mode = ${config.ears};`,
		`v.ears_tail = ${config.tail};`,
		`v.ears_snout = ${config.snout};`
	);
}

const out = path.join('ears_rp', 'entity', 'player.entity.json');
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(json, null, 2) + '\n', 'utf8');

console.log(`wrote ${out}`);
console.log(`  geometry.default: ${replaced ?? '(none)'} -> geometry.ears_player`);
console.log(`  config: ${configArg === "properties" ? "per-player (behaviour pack properties)" : `ears=${config.ears} tail=${config.tail} snout=${config.snout}`}`);
