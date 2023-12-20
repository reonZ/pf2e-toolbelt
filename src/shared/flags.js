import { MODULE_ID } from "../module";

export function getFlag(doc, key, fallback) {
	return doc.getFlag(MODULE_ID, key) ?? fallback;
}

export function setFlag(doc, key, value) {
	return doc.setFlag(MODULE_ID, key, value);
}

export function unsetFlag(doc, key) {
	return doc.unsetFlag(MODULE_ID, key);
}

export function containsFlag(doc, key) {
	return getProperty(doc, `flags.${MODULE_ID}.${key}`) !== undefined;
}

export function updateSourceFlag(doc, key, value) {
	return doc.updateSource({
		[`flags.${MODULE_ID}.${key}`]: value,
	});
}

export function moduleFlagUpdate(update, key, value) {
	update[`flags.${MODULE_ID}.${key}`] = value;
}
