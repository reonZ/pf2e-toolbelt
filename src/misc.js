import {
	MODULE,
	getSetting,
	isChoiceSetting,
	registerUpstreamHook,
	socketEmit,
	socketOff,
	socketOn,
} from "module-api";

export function wrapperError(feature, path) {
	console.error(
		`an error occured in the feature '${feature}' of the module '${MODULE.id}' with the wrapper: '${path}'`,
	);
}

export async function roll3dDice(
	roll,
	{ user = game.user, synchronize = true } = {},
) {
	if (!game.modules.get("dice-so-nice")?.active) return;
	return game.dice3d.showForRoll(roll, user, synchronize);
}

export function settingIsEnabled(setting) {
	const value = getSetting(setting);
	return isChoiceSetting(setting) ? value !== "disabled" : value;
}

export function calledIfSetting(fn, setting) {
	return () => {
		const value = getSetting(setting);
		const enabled = isChoiceSetting(setting) ? value !== "disabled" : value;
		if (enabled) {
			fn(value);
			return;
		}
	};
}

/**
 * @param {string} event
 * @param {(...args: unknown[]) => void} listener
 * @param {object} [options]
 * @param {boolean|string} [options.useChoices]
 * @param {boolean} [options.isUpstream]
 * @returns {(value: ) => void}
 */
export function createHook(
	event,
	listener,
	{ useChoices = false, isUpstream = false } = {},
) {
	let hookId = null;

	const isEnabled = !useChoices
		? (value) => value
		: typeof useChoices === "string"
		  ? (value) => value === useChoices
		  : (value) => value !== "disabled";

	const registerFn = (isUpstream ? registerUpstreamHook : Hooks.on).bind(Hooks);

	return (value) => {
		const enabled = isEnabled(value);

		if (enabled && !hookId) {
			hookId = registerFn(event, listener);
		} else if (!enabled && hookId) {
			Hooks.off(event, hookId);
			hookId = null;
		}
	};
}

export function createSocket(key, listener) {
	let socketEnabled = false;

	const toolKey = `tool-${key}-`;

	const onSocket = (packet) => {
		if (!packet.type?.startsWith(toolKey)) return;
		packet.type = packet.type.slice(toolKey.length);
		listener(packet);
	};

	return {
		emit(packet) {
			packet.type = toolKey + packet.type;
			socketEmit(packet);
		},
		activate() {
			if (socketEnabled) return;
			socketEnabled = true;
			socketOn(onSocket);
		},
		disable() {
			if (!socketEnabled) return;
			socketEnabled = false;
			socketOff(onSocket);
		},
		toggle(enabled = !socketEnabled) {
			if (enabled) this.activate();
			else this.disable();
		},
	};
}
