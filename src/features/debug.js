import { createHook } from "../shared/hook";
import { getSetting } from "../shared/settings";

const appHook = createHook("renderApplication", onRender);
const actorHook = createHook("renderActorSheet", onRender);
const itemHook = createHook("renderItemSheet", onRender);

export function registerDebug() {
	return {
		settings: [
			{
				name: "debug",
				type: Boolean,
				default: false,
				config: false,
				scope: "client",
				onChange: (value) => setup(value),
			},
		],
		init: () => {
			setup();
		},
	};
}

function setup(value) {
	const enabled = value ?? getSetting("debug");
	appHook(enabled);
	actorHook(enabled);
	itemHook(enabled);
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
