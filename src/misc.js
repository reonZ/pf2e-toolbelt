import { MODULE, getSetting, isChoiceSetting } from "module-api";

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

export function settingIsEnabled(setting) {
	const value = getSetting(setting);
	return isChoiceSetting(setting) ? value !== "disabled" : value;
}

export function calledIfSetting(fn, setting) {
	return () => {
		const value = getSetting(setting);
		const enabled = isChoiceSetting(setting) ? value !== "disabled" : value;
		if (enabled) {
			fn(value);
			return;
		}
	};
}
