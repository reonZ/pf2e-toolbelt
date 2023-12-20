import { MODULE_ID } from "../module";
import { error, info, warn } from "./notification";

export function localize(...args) {
	let [key, data] = args;
	key = `${MODULE_ID}.${key}`;
	if (data) return game.i18n.format(key, data);
	return game.i18n.localize(key);
}

export function hasLocalization(key) {
	return game.i18n.has(`${MODULE_ID}.${key}`, false);
}

export function localizePath(key) {
	return `${MODULE_ID}.${key}`;
}

export function subLocalize(subKey) {
	const fn = (...args) => localize(`${subKey}.${args[0]}`, args[1]);

	Object.defineProperties(fn, {
		warn: {
			value: (...args) => warn(`${subKey}.${args[0]}`, args[1], args[2]),
			enumerable: false,
			configurable: false,
		},
		info: {
			value: (...args) => info(`${subKey}.${args[0]}`, args[1], args[2]),
			enumerable: false,
			configurable: false,
		},
		error: {
			value: (...args) => error(`${subKey}.${args[0]}`, args[1], args[2]),
			enumerable: false,
			configurable: false,
		},
		has: {
			value: (key) => hasLocalization(`${subKey}.${key}`),
			enumerable: false,
			configurable: false,
		},
		path: {
			value: (key) => localizePath(`${subKey}.${key}`),
			enumerable: false,
			configurable: false,
		},
		template: {
			value: (key, { hash }) => fn(key, hash),
			enumerable: false,
			configurable: false,
		},
	});

	return fn;
}
