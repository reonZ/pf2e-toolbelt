import { getSetting } from "module-api";
import { createTool } from "../tool";

const setupDebounced = debounce(setup, 1);

export const untargetOptions = {
	name: "untarget",
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
	hooks: [["updateCombat", updateCombat]],
	init: setupDebounced,
};

const { setHook } = createTool(untargetOptions);

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
