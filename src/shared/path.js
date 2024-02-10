import { MODULE_ID } from "../module";

function pathStr(separator, ...path) {
	return path.filter((x) => typeof x === "string").join(separator);
}

export function templatePath(...path) {
	return `modules/${MODULE_ID}/templates/${pathStr("/", ...path)}.hbs`;
}

export function flagPath(...path) {
	return `flags.${MODULE_ID}.${pathStr(".", ...path)}`;
}

export function localizePath(...path) {
	return `${MODULE_ID}.${pathStr(".", ...path)}`;
}
