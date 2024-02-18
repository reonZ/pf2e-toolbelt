import { calledIfSetting } from "../misc";
import { createTool } from "../tool";

export const unidedOptions = {
	name: "unided",
	settings: [
		{
			key: "unided",
			type: String,
			default: "disabled",
			choices: ["disabled", "create", "all"],
			onChange: setup,
		},
	],
	hooks: [
		{ event: "preCreateItem", listener: preCreateItem, useChoices: true },
		{ event: "preUpdateItem", listener: preUpdateItem, useChoices: "all" },
	],
	conflicts: ["pf2e-unided"],
	init: calledIfSetting(setup, "unided"),
};

const { hooks } = createTool(unidedOptions);

function setup(value) {
	hooks.setAll(value);
}

function preCreateItem(item) {
	if (!item.img || !item.isOfType("physical")) return;
	item._source.system.identification.unidentified.img = item.img;
}

function preUpdateItem(item, changes) {
	if (!item.isOfType("physical") || !("img" in changes)) return;
	setProperty(changes, "system.identification.unidentified.img", changes.img);
}
