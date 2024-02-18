import {
	deleteInMemory,
	flagPath,
	getFlag,
	getFlagProperty,
	getInMemory,
	getSetting,
	isInstanceOf,
	registerWrapper,
	render,
	setFlag,
	setInMemory,
	subLocalize,
	unsetFlag,
} from "module-api";
import { isPlayedActor } from "../actor-sheet";

const ACTOR_PREPARE_DATA = "CONFIG.Actor.documentClass.prototype.prepareData";
const DOCUMENT_SHEET_RENDER_INNER = "DocumentSheet.prototype._renderInner";

export const shareOptions = {
	name: "share",
	settings: [
		{
			key: "share",
			type: String,
			default: "disabled",
			choices: ["disabled", "enabled", "force"],
			requiresReload: true,
		},
	],
	init: () => {
		const share = getSetting("share");
		if (share === "disabled") return;

		registerWrapper(ACTOR_PREPARE_DATA, prepareData, "WRAPPER");
		registerWrapper(
			DOCUMENT_SHEET_RENDER_INNER,
			documentSheetRenderInner,
			"WRAPPER",
		);

		Hooks.on("preUpdateActor", preUpdateActor);
		Hooks.on("deleteActor", deleteActor);
		Hooks.on("updateActor", updateActor);
	},
};

async function documentSheetRenderInner(wrapped, ...args) {
	const inner = await wrapped(...args);
	if (!isInstanceOf(this, "CreatureConfig")) return inner;

	const actor = this.actor;
	if (
		!isPlayedActor(actor) ||
		!actor.isOfType("character", "npc") ||
		getSlaves(actor).size
	)
		return inner;

	const masters = game.actors
		.filter((a) => a.id !== actor.id && a.isOwner && isValidMaster(a))
		.map((actor) => ({
			key: actor.id,
			label: actor.name,
		}));

	const group = await render("share/master", {
		masters,
		master: getFlag(actor, "share.master"),
		selectPath: flagPath("share.master"),
		i18n: subLocalize("share.templates.master"),
	});

	inner.children().last().before(group);

	return inner;
}

function deleteActor(actor) {
	removeSlaveFromMaster(actor);

	const slaves = getSlaves(actor);
	Promise.all(
		slaves.map(async (slave) => {
			unsetMaster(slave);
			await unsetFlag(slave, "share.master");
		}),
	);
}

function preUpdateActor(actor, updates) {
	const shareFlag = getFlagProperty(updates, "share");
	if (shareFlag?.master) {
		const master = game.actors.get(shareFlag.master);
		if (isValidMaster(master)) {
			const hpSource = deepClone(master._source.system.attributes.hp);
			setProperty(updates, "system.attributes.hp", hpSource);
		}
	} else {
		const master = getMaster(actor);
		const hpUpdate = getProperty(updates, "system.attributes.hp");
		if (master && hpUpdate) {
			master.update(
				{ system: { attributes: { hp: hpUpdate } } },
				{ noHook: true },
			);
			// biome-ignore lint/performance/noDelete: <explanation>
			delete updates.system.attributes.hp;
		}
	}
}

function updateActor(actor, updates, options, userId) {
	const isOriginalUser = game.user.id === userId;

	const shareFlag = getFlagProperty(updates, "share");
	if (shareFlag?.master !== undefined) {
		const slave = actor;

		removeSlaveFromMaster(slave);

		if (shareFlag.master) {
			const master = game.actors.get(shareFlag.master);
			if (isValidMaster(master)) {
				setMaster(slave, master);
				addSlaveToMaster(master, slave);
			}
		} else {
			unsetMaster(slave);
		}
	}

	if (!isOriginalUser) return;

	const slaves = getSlaves(actor);
	if (slaves.size) {
		const hpUpdate = getProperty(updates, "system.attributes.hp");
		if (hpUpdate) {
			const data = { system: { attributes: { hp: hpUpdate } } };
			Promise.all(
				slaves.map(async (slave) => await slave.update(data, { noHook: true })),
			);
		} else {
			Promise.all(
				slaves.map(async (slave) => await refreshActor(slave, updates)),
			);
		}
	}
}

async function refreshActor(actor, data) {
	const share = getSetting("share");
	if (share === "force") {
		await setFlag(actor, "toggle", !getFlag(actor, "toggle"));
	} else {
		actor.render(false, { action: "update" });
		actor._updateDependentTokens(data);
	}
}

function prepareData(wrapped) {
	wrapped();

	const masterId = getFlag(this, "share.master");
	const master = masterId ? game.actors.get(masterId) : undefined;

	if (!isValidMaster(master)) return;

	if (!getMaster(this)) {
		setMaster(this, master);
		addSlaveToMaster(master, this);
	}

	const hp = this.system.attributes.hp;
	Object.defineProperty(this.system.attributes, "hp", {
		get() {
			const masterHp = master.system.attributes.hp;
			transfertHpData(masterHp, hp);
			return hp;
		},
		enumerable: true,
	});
}

function transfertHpData(from, to) {
	to.breakdown = from.breakdown;
	to.max = from.max;
	to.sp = deepClone(from.sp);
	to.temp = from.temp;
	to.totalModifier = from.totalModifier;
	to.value = from.value;
	to._modifiers = from._modifiers.slice();
}

function getSlaves(actor) {
	return getInMemory(actor, "share.slaves") ?? new Collection();
}

function setMaster(actor, master) {
	return setInMemory(actor, "share.master", master);
}

function unsetMaster(actor) {
	return deleteInMemory(actor, "share.master");
}

function getMaster(actor) {
	return getInMemory(actor, "share.master");
}

function isValidMaster(actor) {
	return actor && actor.type === "character" && !getMaster(actor);
}

function addSlaveToMaster(master, slave) {
	const slaves = getSlaves(master);
	return setInMemory(master, "share.slaves", slaves.set(slave.id, slave));
}

function removeSlaveFromMaster(slave) {
	const master = getMaster(slave);
	if (!master) return;

	const slaves = getSlaves(master);
	slaves.delete(slave.id);
}
