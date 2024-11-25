import {
    ActorPF2e,
    ItemTransferDialog,
    PhysicalItemPF2e,
    TradePacket,
    createTradeMessage,
    enactTradeRequest,
    sendTradeRequest,
    translateTradeData,
} from "module-helpers";
import { createTool } from "../tool";
import { ACTOR_TRANSFER_ITEM_TO_ACTOR } from "./shared/actor";
import { updateItemTransferDialog } from "./shared/item-transfer-dialog";

const debouncedSetup = foundry.utils.debounce(setup, 1);

const { config, socket, settings, wrapper, hook, localize } = createTool({
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
            path: ACTOR_TRANSFER_ITEM_TO_ACTOR,
            callback: actorTransferItemToActor,
        },
    ],
    onSocket: async (packet: TradePacket, userId: string) => {
        const translated = translateTradeData(packet);
        const enactedTradeData = await enactTradeRequest(translated);
        if (enactedTradeData) {
            createTradeMessage(
                enactedTradeData,
                { subtitle: localize.path("subtitle"), message: localize.path("trade") },
                userId
            );
        }
    },
    ready: setup,
} as const);

function setup() {
    const isGM = game.user.isGM;
    const enabled = settings.enabled;

    wrapper.toggle(!isGM && enabled);
    socket.toggle(isGM && enabled);
    hook.toggle(!isGM && enabled);
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
    const [targetActor, item, quantity] = args;

    if (
        !this.isOfType("npc", "character") ||
        !targetActor.isOfType("npc", "character") ||
        !targetActor.hasPlayerOwner ||
        item.quantity < 1 ||
        !this.isOwner ||
        targetActor.isOwner
    )
        // we don't process anything, so we return undefined
        return undefined;

    sendTradeRequest(this, targetActor, item, { quantity }, socket);
    return null;
}

export { config as givethTool };
