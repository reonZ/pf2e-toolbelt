import { calledIfSetting, createHook } from "../misc";

const setCreateHook = createHook("preCreateItem", preCreateItem, {
	useChoices: true,
});
const setUpdateHook = createHook("preUpdateItem", preUpdateItem, {
	useChoices: "all",
});

export function registerUnided() {
	return {
		settings: [
			{
				key: "unided",
				type: String,
				default: "disabled",
				choices: ["disabled", "create", "all"],
				onChange: setup,
			},
		],
		conflicts: ["pf2e-unided"],
		init: calledIfSetting(setup, "unided"),
	};
}

function setup(value) {
	setCreateHook(value);
	setUpdateHook(value);
}

function preCreateItem(item) {
	if (!item.img || !item.isOfType("physical")) return;
	item._source.system.identification.unidentified.img = item.img;
}

function preUpdateItem(item, changes) {
	if (!item.isOfType("physical") || !("img" in changes)) return;
	setProperty(changes, "system.identification.unidentified.img", changes.img);
}
