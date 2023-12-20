import { localize } from "./localize";

function notify(str, arg1, arg2, arg3) {
	const type = typeof arg1 === "string" ? arg1 : "info";
	const data =
		typeof arg1 === "object"
			? arg1
			: typeof arg2 === "object"
			  ? arg2
			  : undefined;
	const permanent =
		typeof arg1 === "boolean"
			? arg1
			: typeof arg2 === "boolean"
			  ? arg2
			  : arg3 ?? false;

	ui.notifications.notify(localize(str, data), type, { permanent });
}

export function warn(...args) {
	const [str, arg1, arg2] = args;
	notify(str, "warning", arg1, arg2);
}

export function info(...args) {
	const [str, arg1, arg2] = args;
	notify(str, "info", arg1, arg2);
}

export function error(...args) {
	const [str, arg1, arg2] = args;
	notify(str, "error", arg1, arg2);
}
