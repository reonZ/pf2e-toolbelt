import { getSetting } from "module-api";
import { createHook } from "../hooks";

const setHook = createHook("updateCombat", updateCombat);

export function registerUntarget() {
	return {
		settings: [
			{
				key: "force-untarget",
				type: Boolean,
				default: false,
				onChange: setup,
			},
			{
				key: "untarget",
				type: Boolean,
				default: false,
				scope: "client",
				onChange: setup,
			},
		],
		init: () => {
			setup();
		},
	};
}

function setup() {
	setHook(getSetting("force-untarget") || getSetting("untarget"));
}

function updateCombat(_, data) {
	if (!("turn" in data) && !("round" in data)) return;

	const user = game.user;
	user.updateTokenTargets();
	user.broadcastActivity({ targets: [] });
}
