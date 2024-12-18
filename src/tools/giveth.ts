import {
    ActorPF2e,
    ActorSheetPF2e,
    DropCanvasItemDataPF2e,
    ItemPF2e,
    ItemTransferDialog,
    PhysicalItemPF2e,
    TradePacket,
    createCallOrEmit,
    giveItemToActor,
    isFriendActor,
} from "module-helpers";
import { createTool } from "../tool";
import { ACTOR_TRANSFER_ITEM_TO_ACTOR } from "./shared/actor";
import { updateItemTransferDialog } from "./shared/item-transfer-dialog";

const debouncedSetup = foundry.utils.debounce(setup, 1);

const { config, socket, settings, wrappers, hook, localize } = createTool({
    name: "giveth",
    settings: [
        {
            key: "enabled",
            type: Boolean,
            default: false,
            onChange: debouncedSetup,
        },
        {
            key: "effect",
            type: String,
            choices: ["disabled", "ally", "all"],
            default: "ally",
            onChange: debouncedSetup,
        },
        {
            key: "message",
            type: Boolean,
            default: true,
        },
    ],
    hooks: [
        {
            event: "renderItemTransferDialog",
            listener: onRenderItemTransferDialog,
        },
    ],
    wrappers: [
        {
            key: "actorTransferItemToActor",
            path: ACTOR_TRANSFER_ITEM_TO_ACTOR,
            callback: actorTransferItemToActor,
        },
        {
            key: "characterSheetHandleDroppedItem",
            path: "CONFIG.Actor.sheetClasses.character['pf2e.CharacterSheetPF2e'].cls.prototype._handleDroppedItem",
            callback: actorSheetHandleDroppedItem,
            type: "MIXED",
        },
        {
            key: "npcSheetHandleDroppedItem",
            path: "CONFIG.Actor.sheetClasses.npc['pf2e.NPCSheetPF2e'].cls.prototype._handleDroppedItem",
            callback: actorSheetHandleDroppedItem,
            type: "MIXED",
        },
        {
            key: "familiarSheetHandleDroppedItem",
            path: "CONFIG.Actor.sheetClasses.familiar['pf2e.FamiliarSheetPF2e'].cls.prototype._handleDroppedItem",
            callback: actorSheetHandleDroppedItem,
            type: "MIXED",
        },
    ],
    onSocket: async (packet: GivethPacket, userId: string) => {
        switch (packet.type) {
            case "trade":
                tradeRequest(packet, userId);
                break;
            case "effect":
                giveEffectRequest(packet, userId);
                break;
        }
    },
    ready: setup,
} as const);

function setup() {
    const isGM = game.user.isGM;
    const enabled = settings.enabled;
    const effect = settings.effect;

    socket.toggle(enabled && isGM);

    hook.toggle(enabled && effect && !isGM);

    wrappers.actorTransferItemToActor.toggle(enabled && !isGM);
    wrappers.npcSheetHandleDroppedItem.toggle(enabled && effect && !isGM);
    wrappers.familiarSheetHandleDroppedItem.toggle(enabled && effect && !isGM);
    wrappers.characterSheetHandleDroppedItem.toggle(enabled && effect && !isGM);
}

const tradeRequest = createCallOrEmit("trade", giveItemToActor, socket);
const giveEffectRequest = createCallOrEmit("effect", giveEffectToActor, socket);

async function actorSheetHandleDroppedItem(
    this: ActorSheetPF2e<ActorPF2e>,
    wrapped: libWrapper.RegisterCallback,
    event: DragEvent,
    item: ItemPF2e,
    data: DropCanvasItemDataPF2e
): Promise<ItemPF2e[]> {
    const actor = this.actor;

    if (
        !item.isOfType("condition", "effect") ||
        actor.isOwner ||
        settings.effect === "disabled" ||
        (settings.effect === "ally" && !isFriendActor(actor))
    ) {
        return wrapped(event, item, data);
    }

    giveEffectRequest({ data, actor });
    return [item];
}

function giveEffectToActor({ data, actor }: { data: DropCanvasItemDataPF2e; actor: ActorPF2e }) {
    const dataTransfer = new DataTransfer();
    dataTransfer.setData("text/plain", JSON.stringify(data));

    const event = new DragEvent("drop", { dataTransfer });
    actor.sheet._onDrop(event);
}

function onRenderItemTransferDialog(app: ItemTransferDialog, $html: JQuery) {
    const thisActor = app.item.actor;
    const targetActor = app.options.targetActor;

    if (
        app.options.isPurchase ||
        !thisActor?.isOfType("npc", "character") ||
        !targetActor?.isOfType("npc", "character") ||
        !targetActor.hasPlayerOwner ||
        targetActor.isOwner
    )
        return;

    updateItemTransferDialog(app, $html, localize.path("subtitle"), localize.path("question"));
}

async function actorTransferItemToActor(
    this: ActorPF2e,
    ...args: ActorTransferItemArgs
): Promise<PhysicalItemPF2e<ActorPF2e> | null | undefined> {
    const [target, item, quantity] = args;

    if (
        !this.isOfType("npc", "character") ||
        !target.isOfType("npc", "character") ||
        !target.hasPlayerOwner ||
        item.quantity < 1 ||
        !this.isOwner ||
        target.isOwner
    )
        // we don't process anything, so we return undefined
        return undefined;

    tradeRequest({
        item,
        quantity,
        target,
        origin: this,
        message: { subtitle: localize.path("subtitle"), message: localize.path("trade") },
    });
    return null;
}

type GivethPacket =
    | TradePacket<"trade">
    | { type: "effect"; data: DropCanvasItemDataPF2e; actor: string };

export { config as givethTool };
