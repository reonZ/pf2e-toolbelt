import { calledIfSetting } from "../misc";
import { createTool } from "../tool";

export const debugOptions = {
	name: "debug",
	settings: [
		{
			key: "debug",
			type: Boolean,
			default: false,
			config: false,
			scope: "client",
			onChange: setup,
		},
	],
	hooks: [
		["renderApplication", onRender],
		["renderActorSheet", onRender],
		["renderItemSheet", onRender],
	],
	init: calledIfSetting(setup, "debug"),
};

const { hooks } = createTool(debugOptions);

function setup(value) {
	hooks.setAll(value);
}

function onRender(app, html) {
	const link = html.find(".document-id-link")[0];
	if (!link) return;

	link.addEventListener(
		"click",
		(event) => {
			if (!event.shiftKey) return;

			const obj = app.object;
			if (!obj) return;

			event.preventDefault();
			event.stopPropagation();

			const type = obj.type;

			let i = 2;
			let variable = type;
			while (window[variable]) {
				variable = `${type}${i++}`;
			}

			window[variable] = obj;
			console.log(variable, obj);
		},
		true,
	);
}
