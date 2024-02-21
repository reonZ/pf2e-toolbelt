import {
	getSetting,
	registerUpstreamHook,
	socketEmit,
	socketOff,
	socketOn,
} from "module-api";

export function checkFeatureOptions(options) {
	if (!options.name) {
		throw new Error("module features need a name");
	}

	if (!options.settings?.length) {
		throw new Error("module features need at least one setting");
	}
}

export function createTool(options) {
	checkFeatureOptions(options);

	const tool = {};

	if (options.hooks?.length) {
		const hooks = new Map();

		tool.hooks = {
			/**
			 * @param {string} key
			 * @param {unknown} value
			 */
			set: (key, value) => {
				hooks.get(key)?.(value);
			},
			/**
			 * @param {string} key
			 * @param {string} setting
			 */
			setFromSetting: (key, setting) => {
				const value = getSetting(setting);
				hooks.get(key)?.(value);
			},
			/**
			 * @param {unknown} value
			 */
			setAll: (value) => {
				for (const [_, listener] of hooks) {
					listener(value);
				}
			},
		};

		for (const hook of options.hooks) {
			const key = hook.key ?? hook[0] ?? hook.event;
			hooks.set(key, createHook(hook));
		}

		if (options.hooks.length === 1) {
			/**
			 * @type {ReturnType<createHook> & {fromSetting: (setting: value) => void}}
			 */
			tool.setHook = [...hooks][0][1];
			tool.setHook.fromSetting = function (setting) {
				const value = getSetting(setting);
				this(value);
			};
		}
	}

	if (options.socket) {
		tool.socket = createSocket(options.name, options.socket);
	}

	return tool;
}

function createHook(hook) {
	const {
		event,
		listener,
		useChoices = false,
		isUpstream = false,
	} = Array.isArray(hook) ? { event: hook[0], listener: hook[1] } : hook;

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

function createSocket(key, listener) {
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
