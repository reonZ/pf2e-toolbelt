import {
    ActorPF2e,
    ActorTransferItemArgs,
    ArmorPF2e,
    ChatMessagePF2e,
    createSharedWrapper,
    WeaponPF2e,
} from "module-helpers";

const TRAITS_BLACKLIST = ["curse", "death", "disease", "mythic"] as const;

const sharedWeaponPrepareBaseData = createSharedWrapper<
    WeaponPF2e<ActorPF2e>,
    () => void,
    () => void
>(
    "WRAPPER",
    "CONFIG.PF2E.Item.documentClasses.weapon.prototype.prepareBaseData",
    function (registered, wrapped) {
        for (const listener of registered) {
            listener();
        }

        wrapped();
    }
);

const sharedArmorPrepareBaseData = createSharedWrapper<
    ArmorPF2e<ActorPF2e>,
    () => void,
    () => void
>(
    "WRAPPER",
    "CONFIG.PF2E.Item.documentClasses.armor.prototype.prepareBaseData",
    function (registered, wrapped) {
        for (const listener of registered) {
            listener();
        }

        wrapped();
    }
);

const sharedActorTransferItemToActor = createSharedWrapper<
    ActorPF2e,
    (...args: ActorTransferItemArgs) => boolean,
    (...args: ActorTransferItemArgs) => boolean
>(
    "MIXED",
    "CONFIG.Actor.documentClass.prototype.transferItemToActor",
    function (registered, wrapped, args) {
        for (const listener of registered) {
            const cancel = listener(...args);
            // we processed the item and should stop there
            if (cancel) return;
        }

        return wrapped();
    }
);

const sharedMessageRenderHTML = createSharedWrapper<
    ChatMessagePF2e,
    (...args: any[]) => Promise<HTMLElement>,
    (html: HTMLElement) => Promise<void>
>("WRAPPER", "ChatMessage.prototype.renderHTML", async function (registered, wrapped, args) {
    const html = await wrapped();
    await Promise.all(registered.map((listener) => listener(html)));
    return html;
});

export {
    sharedActorTransferItemToActor,
    sharedArmorPrepareBaseData,
    sharedMessageRenderHTML,
    sharedWeaponPrepareBaseData,
    TRAITS_BLACKLIST,
};
