import { getSetting } from "module-api";
import { createHook } from "../misc";

const setHook = createHook("updateCombat", updateCombat);

const setupDebounced = debounce(setup, 1);

export function registerUntarget() {
	return {
		settings: [
			{
				key: "force-untarget",
				type: Boolean,
				default: false,
				onChange: setupDebounced,
			},
			{
				key: "untarget",
				type: Boolean,
				default: false,
				scope: "client",
				onChange: setupDebounced,
			},
		],
		init: setupDebounced,
	};
}

function setup() {
	const enabled = getSetting("force-untarget") || getSetting("untarget");
	setHook(enabled);
}

function updateCombat(_, data) {
	if (!("turn" in data) && !("round" in data)) return;

	const user = game.user;
	user.updateTokenTargets();
	user.broadcastActivity({ targets: [] });
}
