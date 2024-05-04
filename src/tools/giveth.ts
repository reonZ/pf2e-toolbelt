import {
    MoveLootPopup,
    createTradeMessage,
    getDropTarget,
    getHighestName,
    hasGMOnline,
    isPlayedActor,
    transferItemToActor,
} from "pf2e-api";
import { createTool } from "../tool";

const debouncedSetup = debounce(setup, 1);

const { config, localize, socket, settings, hook } = createTool({
    name: "giveth",
    settings: [
        {
            key: "enabled",
            type: Boolean,
            default: false,
            onChange: debouncedSetup,
        },
        {
            key: "message",
            type: Boolean,
            default: true,
            onChange: debouncedSetup,
        },
    ],
    hooks: [
        {
            event: "dropCanvasData",
            listener: onDropCanvasData,
            isUpstream: true,
        },
    ],
    onSocket: giveth,
    ready: debouncedSetup,
} as const);

function setup() {
    const isGM = game.user.isGM;
    const enabled = settings.enabled;

    socket.toggle(isGM && enabled);
    hook.toggle(!isGM && enabled && settings.message);
}

function onDropCanvasData(canvas: Canvas, data: DropCanvasItemDataPF2e) {
    if (data.type !== "Item" || !data.fromInventory || !data.uuid) {
        return true;
    }

    const item = fromUuidSync<ItemPF2e>(data.uuid);
    if (!item?.isOfType("physical")) return true;

    const origin = item.actor;
    if (!isValidActor(origin) || !origin.isOwner) return true;

    const target = getDropTarget(canvas, data, (token) => {
        const actor = token.actor as ActorPF2e | null;
        return token.document.actorLink && isValidActor(actor, data.actorId);
    })?.actor as ActorPF2e | undefined;

    if (!target || target.isOwner) return true;

    if (!hasGMOnline()) {
        localize.error("error.noGM");
        return true;
    }

    const quantity = item.quantity;

    if (quantity < 1) {
        localize.warn("error.zero");
        return false;
    }

    const socketPacket: SocketPacket = {
        itemId: item.id,
        originId: origin.id,
        targetId: target.id,
    };

    if (quantity === 1) {
        socket.emit(socketPacket);
        return false;
    }

    const stackable = !!target.inventory.findStackableItem(item._source);

    new MoveLootPopup(
        origin,
        {
            quantity: { max: quantity, default: quantity },
            lockStack: !stackable,
            isPurchase: false,
        },
        (quantity, newStack) => {
            socketPacket.quantity = quantity;
            socketPacket.newStack = newStack;
            socket.emit(socketPacket);
        }
    ).render(true);

    return false;
}

async function giveth(
    { itemId, originId, targetId, newStack = false, quantity = 1 }: SocketPacket,
    senderId: string
) {
    const origin = game.actors.get<ActorPF2e>(originId);
    const target = game.actors.get<ActorPF2e>(targetId);
    const item = origin?.inventory.get(itemId);

    if (!origin || !target || !item || item.quantity < 1) return;

    const tradedQuantity = Math.min(quantity, item.quantity);
    const newItem = await transferItemToActor(target, item, tradedQuantity, undefined, newStack);

    if (!settings.message || !newItem) return;

    const message = localize("trade", {
        giver: getHighestName(origin),
        quantity: tradedQuantity,
        item: newItem.link,
        recipient: getHighestName(target),
    });

    createTradeMessage(localize("subtitle"), message, origin, newItem, senderId);
}

function isValidActor<T extends ActorPF2e>(actor: T | null, excludeId?: string): actor is T {
    return (
        isPlayedActor(actor) &&
        (!excludeId || actor.id !== excludeId) &&
        actor.hasPlayerOwner &&
        !actor.isToken &&
        actor.isOfType("character", "npc", "vehicle")
    );
}

type SocketPacket = {
    originId: string;
    targetId: string;
    itemId: string;
    quantity?: number;
    newStack?: boolean;
};

export { config as givethTool };
