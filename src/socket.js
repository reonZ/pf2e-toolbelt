import { MODULE, socketEmit } from "module-api";

/**
 * @typedef {import('module-api').ModulePacket} ModulePacket
 * @typedef {import('module-api').ModuleSocketFunction} ModuleSocketFunction
 *
 * @type {Record<string, {listener: ModuleSocketFunction, active: boolean}>}
 */
const registeredSockets = {};

/**
 * @type {ModuleSocketFunction}
 */
export function onSocket(packet, senderId) {
	if (!packet.key) return;

	const user = game.user;
	if (user.id === senderId) return;

	const registered = registeredSockets[packet.key];
	if (!registered?.active) return;

	registered.listener(packet, senderId);
}

/**
 * @param {string} key
 * @param {ModuleSocketFunction} listener
 */
export function registerSocket(key, listener) {
	if (registeredSockets[key]) {
		MODULE.error(
			`a socket listener with the key '${key}' has already been registered`,
		);
	}

	registeredSockets[key] = { listener, active: false };

	return {
		emit: (packet) => {
			packet.key = key;
			socketEmit(packet);
		},
		activate: () => {
			registeredSockets[key].active = true;
		},
		disable: () => {
			registeredSockets[key].active = false;
		},
		toggle: (enabled) => {
			registeredSockets[key].active = enabled ?? !registeredSockets[key].active;
		},
	};
}
