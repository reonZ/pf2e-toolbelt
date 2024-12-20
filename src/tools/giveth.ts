import {
    ActorPF2e,
    ActorSheetPF2e,
    DropCanvasItemDataPF2e,
    ExtractSocketOptions,
    ItemPF2e,
    ItemTransferDialog,
    PhysicalItemPF2e,
    addItemsToActor,
    createCallOrEmit,
    createTransferMessage,
    getTransferData,
    isFriendActor,
    updateTransferSource,
} from "module-helpers";
import { globalSettings } from "./global";
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
    api: {
        canDropEffectOnActor,
    },
    onSocket: async (packet: GivethPacket, userId: string) => {
        switch (packet.type) {
            case "trade":
                giveItemRequest(packet, userId);
                break;
            case "effect":
                giveEffectRequest(packet, userId);
                break;
        }
    },
    ready: setup,
} as const);

const giveItemRequest = createCallOrEmit("trade", givethItem, socket);
const giveEffectRequest = createCallOrEmit("effect", giveEffectToActor, socket);

function setup() {
    const isGM = game.user.isGM;
    const enabled = settings.enabled;
    const effect = settings.effect !== "disabled";

    socket.toggle(enabled && isGM);

    hook.toggle(enabled && !isGM);

    wrappers.actorTransferItemToActor.toggle(enabled && !isGM);
    wrappers.npcSheetHandleDroppedItem.toggle(enabled && effect && !isGM);
    wrappers.familiarSheetHandleDroppedItem.toggle(enabled && effect && !isGM);
    wrappers.characterSheetHandleDroppedItem.toggle(enabled && effect && !isGM);
}

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
        (settings.effect === "ally" && !isFriendActor(actor))
    ) {
        return wrapped(event, item, data);
    }

    giveEffectRequest({ data, actor });
    return [item];
}

function canDropEffectOnActor(item: ItemPF2e, actor: ActorPF2e) {
    if (!item.isOfType("condition", "effect")) return false;
    if (actor.isOwner) return true;

    const setting = settings.effect;
    return setting === "all" || (setting === "ally" && isFriendActor(actor));
}

function giveEffectToActor({ data, actor }: GiveEffectOptions) {
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

    updateItemTransferDialog(
        app,
        $html,
        localize.path("dialog.title"),
        localize.path("dialog.prompt")
    );
}

async function actorTransferItemToActor(
    this: ActorPF2e,
    ...args: ActorTransferItemArgs
): Promise<PhysicalItemPF2e<ActorPF2e> | null | undefined> {
    const [targetActor, item, quantity, _containerId, newStack] = args;

    if (
        this.isOfType("npc", "character") &&
        targetActor.isOfType("npc", "character") &&
        targetActor.hasPlayerOwner &&
        item.quantity >= 1 &&
        this.isOwner &&
        !targetActor.isOwner
    ) {
        giveItemRequest({ item, targetActor, quantity, newStack });
        // we return null to signal we took over the process
        return null;
    }
}

async function givethItem(
    { item, quantity, targetActor, newStack }: GiveItemOptions,
    userId: string
) {
    const withContent = globalSettings.withContent;
    const transferData = await getTransferData({ item, quantity, withContent });

    if (!transferData) {
        localize.error("error.unknown");
        return;
    }

    const items = await addItemsToActor({ ...transferData, targetActor, newStack });

    if (!items) {
        localize.error("error.unknown");
        return;
    }

    await updateTransferSource({ item, quantity: transferData.quantity, withContent });

    if (!settings.message) return;

    createTransferMessage({
        sourceActor: item.actor,
        targetActor,
        item: items.item,
        quantity: transferData.quantity,
        userId,
        subtitle: localize("message.subtitle"),
        message: localize.path(
            "message.content",
            transferData.contentSources.length ? "container" : "item"
        ),
    });
}

type GiveEffectOptions = {
    data: DropCanvasItemDataPF2e;
    actor: ActorPF2e;
};

type GiveItemOptions = {
    item: PhysicalItemPF2e<ActorPF2e>;
    targetActor: ActorPF2e;
    quantity: number;
    newStack?: boolean;
};

type GivethPacket =
    | ExtractSocketOptions<"trade", GiveItemOptions>
    | ExtractSocketOptions<"effect", GiveEffectOptions>;

export { config as givethTool };
