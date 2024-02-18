import {
	MoveLootPopup,
	chatUUID,
	getSetting,
	isGMOnline,
	localize,
	transferItemToActor,
	warn,
} from "module-api";
import { isPlayedActor } from "../actor";
import { calledIfSetting, createHook, createSocket } from "../misc";

const setHook = createHook("dropCanvasData", dropCanvasData, {
	isUpstream: true,
	useChoices: true,
});

const socket = createSocket("giveth", onSocket);

export function registerGiveth() {
	return {
		settings: [
			{
				key: "giveth",
				type: String,
				default: "disabled",
				choices: ["disabled", "enabled", "no-message"],
				onChange: setup,
			},
		],
		conflicts: ["pf2e-giveth"],
		ready: calledIfSetting(setup, "giveth"),
	};
}

function setup(value) {
	if (game.user.isGM) {
		socket.toggle(value);
	} else {
		setHook(value);
	}
}

function onSocket(packet) {
	if (packet.type === "giveth-condition") takethCondition(packet);
	else if (packet.type === "giveth-effect") takethEffect(packet);
	else takethPhysical(packet);
}

function dropCanvasData(canvas, data) {
	if (!isGMOnline()) return true;

	const details = getDetailsFromData(data);
	if (!details) return true;

	const target = canvas.tokens.placeables
		.slice()
		.filter((token) => {
			if (!token.document.actorLink) return false;
			const target = token.actor;
			if (!isValidActor(target, data.actorId) || target.isOwner) return false;
			const maximumX = token.x + (token.hitArea?.right ?? 0);
			const maximumY = token.y + (token.hitArea?.bottom ?? 0);
			return (
				data.x >= token.x &&
				data.y >= token.y &&
				data.x <= maximumX &&
				data.y <= maximumY
			);
		})
		.sort((a, b) => b.document.sort - a.document.sort)
		.at(0)?.actor;

	if (!target) return true;

	giveth(details.actor, target, details.item, details.value);
	return false;
}

function giveth(origin, target, item, value) {
	const ownerId = origin.id;
	const targetId = target.id;
	const isIndex = !(item instanceof Item);

	if (!isIndex && item.isOfType("physical")) {
		const qty = item.quantity;

		if (qty < 1) {
			return warn("giveth.notification.zero");
		}
		if (qty === 1) {
			return sendPhysicalRequest(ownerId, targetId, item.id, 1, false);
		}

		const stackable = target.inventory.findStackableItem(item._source);

		new MoveLootPopup(
			origin,
			{
				quantity: { max: qty, default: qty },
				lockStack: !stackable,
				isPurchase: false,
			},
			(quantity, newStack) => {
				sendPhysicalRequest(ownerId, targetId, item.id, quantity, newStack);
			},
		).render(true);
	} else {
		const uuid = isIndex ? `Compendium.${item.pack}.${item._id}` : item.uuid;
		if (item.type === "condition") {
			socket.emit({
				type: "giveth-condition",
				targetId,
				value: value ?? 1,
				uuid,
			});
		} else {
			socket.emit({
				type: "giveth-effect",
				targetId,
				uuid,
			});
		}
	}
}

function sendPhysicalRequest(ownerId, targetId, itemId, qty, stack) {
	socket.emit({
		type: "giveth-physical",
		ownerId,
		targetId,
		itemId,
		qty,
		stack,
	});
}

function isValidActor(actor, id) {
	if (!isPlayedActor(actor) || (id && actor.id === id)) return false;
	return (
		actor.hasPlayerOwner &&
		!actor.isToken &&
		actor.isOfType("character", "npc", "vehicle")
	);
}

function getDetailsFromData(data) {
	if (data.tokenId || data.type !== "Item" || !data.uuid) return;

	const item = fromUuidSync(data.uuid);
	if (!item) return;

	let actor = item.actor;
	if (!actor) {
		const actorUUID = data.context?.origin.actor;
		actor = actorUUID ? fromUuidSync(actorUUID) : null;
	}

	if (!isValidActor(actor) || !actor.isOwner) return;

	const isIndex = !(item instanceof Item);
	if (isIndex && item.pack && ["effect", "condition"].includes(item.type))
		return { actor, item, value: data.value };
	if (!isIndex && item.isOfType("physical", "effect"))
		return { actor, item, value: data.value };
}

async function takethCondition({ targetId, uuid, value }) {
	const target = game.actors.get(targetId);
	if (!target) return;

	const item = await fromUuid(uuid);
	if (!item) return;

	target.increaseCondition(item.slug, { min: value });
}

async function takethEffect({ targetId, uuid }) {
	const target = game.actors.get(targetId);
	if (!target) return;

	const item = await fromUuid(uuid);
	if (!item) return;

	const source = item
		.clone({ "system.tokenIcon.show": true, "system.unidentified": false })
		.toObject();
	target.createEmbeddedDocuments("Item", [source]);
}

async function takethPhysical({ itemId, ownerId, qty, stack, targetId }) {
	const owner = game.actors.get(ownerId);
	const target = game.actors.get(targetId);
	if (!owner || !target) return;

	const item = owner.items.get(itemId);
	if (!item) return;

	const itemQuantity = Math.min(qty, item.quantity);
	const newItem = await transferItemToActor(
		target,
		item,
		itemQuantity,
		undefined,
		stack,
	);

	if (getSetting("giveth") === "no-message") return;

	let content = chatUUID(newItem.uuid, newItem.name, !newItem.isIdentified);
	if (itemQuantity > 1) content += ` x${itemQuantity}`;

	const giveth = localize("giveth.giveth", {
		target: target.name,
	});

	ChatMessage.create({
		flavor: `<h4 class="action">${giveth}</h4>`,
		content,
		speaker: ChatMessage.getSpeaker({ actor: owner }),
	});
}
