import {
    ActorPF2e,
    ItemTransferDialog,
    PhysicalItemPF2e,
    TradePacket,
    createCallOrEmit,
    giveItemToActor,
} from "module-helpers";
import { createTool } from "../tool";
import { ACTOR_TRANSFER_ITEM_TO_ACTOR } from "./shared/actor";
import { updateItemTransferDialog } from "./shared/item-transfer-dialog";

const { config, socket, settings, wrapper, hook, localize } = createTool({
    name: "giveth",
    settings: [
        {
            key: "enabled",
            type: Boolean,
            default: false,
            onChange: (enabled: boolean) => {
                const isGM = game.user.isGM;

                wrapper.toggle(!isGM && enabled);

                socket.toggle(isGM && enabled);
                hook.toggle(!isGM && enabled);
            },
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
    ],
    onSocket: async (packet: TradePacket<"trade">, userId: string) => {
        if (packet.type === "trade") {
            tradeRequest(packet, userId);
        }
    },
    ready: (isGM) => {
        if (!settings.enabled) return;

        wrapper.toggle(!isGM);

        socket.toggle(isGM);
        hook.toggle(!isGM);
    },
} as const);

const tradeRequest = createCallOrEmit("trade", giveItemToActor, socket);

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

export { config as givethTool };
