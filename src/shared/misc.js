import { MODULE_ID } from "../module";

export function localeCompare(a, b) {
	return a.localeCompare(b, game.i18n.lang);
}

export function refreshCharacterSheets(actor) {
	for (const win of Object.values(ui.windows)) {
		const winActor = win.actor;
		if (!(win instanceof ActorSheet) || !winActor.isOfType("character"))
			continue;
		if (!actor || actor === winActor) win.render();
	}
}

export function compareArrays(arr1, arr2) {
	if (arr1.length !== arr2.length) return false;

	const clonedArr2 = arr2.slice();

	for (const arr1Value of arr1) {
		const index = clonedArr2.findIndex((arr2Value) => arr1Value === arr2Value);
		if (index === -1) return false;
		clonedArr2.splice(index, 1);
	}

	return true;
}

export function ordinalString(value) {
	const pluralRules = new Intl.PluralRules(game.i18n.lang, { type: "ordinal" });
	const suffix = game.i18n.localize(
		`PF2E.OrdinalSuffixes.${pluralRules.select(value)}`,
	);
	return game.i18n.format("PF2E.OrdinalNumber", { value, suffix });
}

export function isInstanceOf(obj, name) {
	if (typeof obj !== "object") return false;

	let cursor = Reflect.getPrototypeOf(obj);
	while (cursor) {
		if (cursor.constructor.name === name) return true;
		cursor = Reflect.getPrototypeOf(cursor);
	}

	return false;
}

export function setInMemory(doc, key, value) {
	return setProperty(doc, `modules.${MODULE_ID}.${key}`, value);
}

export function getInMemory(doc, key) {
	return getProperty(doc, `modules.${MODULE_ID}.${key}`);
}

export function deleteInMemory(doc, key) {
	const split = `modules.${MODULE_ID}.${key}`.split(".");
	const last = split.pop();
	let cursor = doc;
	for (const key of split) {
		cursor = cursor[key];
		if (!cursor) return true;
	}
	return delete cursor[last];
}
