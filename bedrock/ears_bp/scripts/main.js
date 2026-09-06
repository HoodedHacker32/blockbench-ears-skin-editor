// In-game configuration for the Ears resource pack.
//
// Nothing here can read the skin -- Bedrock exposes no way to sample a texture,
// so the magic pixels an Ears skin carries are invisible to an addon. Instead
// each player picks their own settings, which are stored as entity properties
// that the resource pack's pre_animation script reads back.
//
// Open with:  /scriptevent ears:config

import { world, system } from '@minecraft/server';
import { ActionFormData } from '@minecraft/server-ui';

const EAR_MODES = ['None', 'Above', 'Sides'];
const TAIL_MODES = ['None', 'Down', 'Back', 'Up'];

function get(player, prop) {
	try {
		return player.getProperty(prop) ?? 0;
	} catch {
		return 0;
	}
}

function set(player, prop, value) {
	try {
		player.setProperty(prop, value);
		return true;
	} catch (e) {
		player.sendMessage(`§cCouldn't set ${prop}: ${e}`);
		return false;
	}
}

function cycle(player, prop, count) {
	const next = (get(player, prop) + 1) % count;
	set(player, prop, next);
	return next;
}

async function showMenu(player) {
	const form = new ActionFormData()
		.title('Ears')
		.body(
			'Your skin supplies the artwork; these choose which shapes are drawn.\n' +
			'Paint them into the unused regions of your 64x64 skin.'
		)
		.button(`Ears: ${EAR_MODES[get(player, 'ears:mode')] ?? 'None'}`)
		.button(`Tail: ${TAIL_MODES[get(player, 'ears:tail')] ?? 'None'}`)
		.button(`Snout: ${get(player, 'ears:snout') ? 'On' : 'Off'}`)
		.button('Close');

	const response = await form.show(player);
	if (response.canceled || response.selection === 3) return;

	if (response.selection === 0) cycle(player, 'ears:mode', EAR_MODES.length);
	else if (response.selection === 1) cycle(player, 'ears:tail', TAIL_MODES.length);
	else if (response.selection === 2) cycle(player, 'ears:snout', 2);

	// Re-open so the player can keep adjusting without re-running the command.
	system.run(() => showMenu(player));
}

system.afterEvents.scriptEventReceive.subscribe(
	(event) => {
		if (event.id !== 'ears:config') return;
		const player = event.sourceEntity;
		if (!player || player.typeId !== 'minecraft:player') return;
		// Forms can't be shown from inside a read-only event handler.
		system.run(() => showMenu(player));
	},
	{ namespaces: ['ears'] }
);

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
	if (!initialSpawn) return;
	player.sendMessage('§7Ears loaded. Run §f/scriptevent ears:config§7 to set up your ears.');
});
