import {
    ActorPF2e,
    ContainerPF2e,
    ExtractSocketOptions,
    PhysicalItemPF2e,
    addItemsToActor,
    createCallOrEmit,
    getTransferData,
    updateTransferSource,
    userIsGM,
} from "module-helpers";
import { createTool } from "../tool";
import { ACTOR_TRANSFER_ITEM_TO_ACTOR } from "./shared/actor";

const { config, settings, wrapper, localize, socket } = createTool({
    name: "global",
    settings: [
        {
            key: "withContent",
            type: Boolean,
            default: false,
            onChange: (value: boolean) => {
                setup();
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
    onSocket: async (packet: GlobalPack, userId: string) => {
        switch (packet.type) {
            case "withContent":
                withContentRequest(packet, userId);
                break;
        }
    },
    init: setup,
} as const);

const withContentRequest = createCallOrEmit("withContent", withContent, socket);

function setup() {
    const isGM = userIsGM();
    const withContent = settings.withContent;

    wrapper.toggle(withContent);
    socket.toggle(withContent && isGM);
}

async function actorTransferItemToActor(
    this: ActorPF2e,
    ...args: ActorTransferItemArgs
): Promise<PhysicalItemPF2e<ActorPF2e> | null | undefined> {
    const [targetActor, item] = args;
    const isLoot = this.isOfType("loot");
    const targetIsLoot = targetActor.isOfType("loot");

    if (
        item.isOfType("backpack") &&
        item.quantity >= 1 &&
        item.contents.size > 0 &&
        this.canUserModify(game.user, "update") &&
        targetActor.canUserModify(game.user, "update") &&
        (!isLoot || !this.isMerchant) &&
        (!targetIsLoot || !targetActor.isMerchant)
    ) {
        if (!game.user.isGM && (isLoot || targetIsLoot)) {
            withContentRequest({ item, targetActor });
        } else {
            withContent({ item, targetActor });
        }

        // we return null to signal we took over the process
        return null;
    }
}

async function withContent({ item, targetActor }: WithContentOptions) {
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

type WithContentOptions = {
    item: ContainerPF2e<ActorPF2e>;
    targetActor: ActorPF2e;
};

type GlobalPack = ExtractSocketOptions<"withContent", WithContentOptions>;

export { config as GlobalTool, settings as globalSettings };
