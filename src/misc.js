import { MODULE } from "module-api";

export function wrapperError(feature, path) {
	console.error(
		`an error occured in the feature '${feature}' of the module '${MODULE.id}' with the wrapper: '${path}'`,
	);
}

export async function roll3dDice(
	roll,
	{ user = game.user, synchronize = true } = {},
) {
	if (!game.modules.get("dice-so-nice")?.active) return;
	return game.dice3d.showForRoll(roll, user, synchronize);
}
