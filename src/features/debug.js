import { calledIfSetting, createHook } from "../misc";

const hooks = [
	createHook("renderApplication", onRender),
	createHook("renderActorSheet", onRender),
	createHook("renderItemSheet", onRender),
];

export function registerDebug() {
	return {
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
		init: calledIfSetting(setup, "debug"),
	};
}

function setup(value) {
	for (const setHook of hooks) {
		setHook(value);
	}
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
