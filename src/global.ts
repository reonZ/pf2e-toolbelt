import {
    ActorPF2e,
    ContainerPF2e,
    PhysicalItemPF2e,
    addItemsToActor,
    getTransferData,
    updateTransferSource,
} from "module-helpers";
import { createTool } from "./tool";
import { ACTOR_TRANSFER_ITEM_TO_ACTOR } from "./tools/shared/actor";

const { config, settings, wrapper, localize } = createTool({
    name: "global",
    settings: [
        {
            key: "withContent",
            type: Boolean,
            default: false,
            onChange: (value: boolean) => {
                wrapper.toggle(value);
            },
        },
    ],
    wrappers: [
        {
            key: "actorTransferItemToActor",
            path: ACTOR_TRANSFER_ITEM_TO_ACTOR,
            callback: actorTransferItemToActor,
            priority: -100,
        },
    ],
    init: () => {
        wrapper.toggle(settings.withContent);
    },
} as const);

async function actorTransferItemToActor(
    this: ActorPF2e,
    ...args: ActorTransferItemArgs
): Promise<PhysicalItemPF2e<ActorPF2e> | null | undefined> {
    const [targetActor, item] = args;

    if (
        item.isOfType("backpack") &&
        item.quantity >= 1 &&
        item.contents.size > 0 &&
        this.canUserModify(game.user, "update") &&
        targetActor.canUserModify(game.user, "update") &&
        (!this.isOfType("loot") || !this.isMerchant) &&
        (!targetActor.isOfType("loot") || !targetActor.isMerchant)
    ) {
        giveItem({ item, targetActor });
        // we return null to signal we took over the process
        return null;
    }
}

async function giveItem({
    item,
    targetActor,
}: {
    item: ContainerPF2e<ActorPF2e>;
    targetActor: ActorPF2e;
}) {
    const transferData = await getTransferData({ item, quantity: 1, withContent: true });

    if (!transferData) {
        localize.error("withContent.error.unknown");
        return;
    }

    const items = await addItemsToActor({ ...transferData, targetActor });

    if (!items) {
        localize.error("withContent.error.unknown");
        return;
    }

    await updateTransferSource({ item, quantity: 1, withContent: true });
}

export { config as GlobalTool, settings as globalSettings };
