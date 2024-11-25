import { ActorPF2e, PhysicalItemPF2e } from "module-helpers";
import { createSharedWrapper } from "./sharedWrapper";

const ACTOR_TRANSFER_ITEM_TO_ACTOR = "CONFIG.Actor.documentClass.prototype.transferItemToActor";

const actorWrappers = {
    [ACTOR_TRANSFER_ITEM_TO_ACTOR]: createSharedWrapper(
        ACTOR_TRANSFER_ITEM_TO_ACTOR,
        actorTransferItemToActor,
        "MIXED"
    ),
};

async function actorTransferItemToActor(
    this: ActorPF2e,
    wrapperError: (error: Error) => void,
    listeners: ((
        ...args: ActorTransferItemArgs
    ) => Promise<PhysicalItemPF2e<ActorPF2e> | null | undefined>)[],
    wrapped: libWrapper.RegisterCallback,
    ...args: ActorTransferItemArgs
) {
    try {
        for (const listener of listeners) {
            const item = await listener.apply(this, args);
            /**
             * if anything but undefined is returned, it means
             * we processed the item and should stop there
             */
            if (item !== undefined) return item;
        }
    } catch (error) {
        wrapperError(error);
    }

    return wrapped(...args);
}

export { ACTOR_TRANSFER_ITEM_TO_ACTOR, actorWrappers };
