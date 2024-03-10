import { MODULE, getSetting, isChoiceSetting } from "module-api";

export function wrapperError(feature, path) {
	console.error(
		`an error occured in the feature '${feature}' of the module '${MODULE.id}' with the wrapper: '${path}'`,
	);
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
