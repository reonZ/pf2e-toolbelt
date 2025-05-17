import {
    ActorPF2e,
    ActorTransferItemArgs,
    ArmorPF2e,
    createSharedWrapper,
    WeaponPF2e,
} from "module-helpers";

const sharedWeaponPrepareBaseData = createSharedWrapper<WeaponPF2e<ActorPF2e>, () => void>(
    "WRAPPER",
    "CONFIG.PF2E.Item.documentClasses.weapon.prototype.prepareBaseData",
    function (registered, wrapped) {
        for (const listener of registered) {
            listener();
        }

        wrapped();
    }
);

const sharedArmorPrepareBaseData = createSharedWrapper<ArmorPF2e<ActorPF2e>, () => void>(
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
    (...args: ActorTransferItemArgs) => boolean
>(
    "MIXED",
    "CONFIG.Actor.documentClass.prototype.transferItemToActor",
    function (registered, wrapped) {
        for (const listener of registered) {
            const cancel = listener();
            // we processed the item and should stop there
            if (cancel) return;
        }

        return wrapped();
    }
);

export { sharedActorTransferItemToActor, sharedArmorPrepareBaseData, sharedWeaponPrepareBaseData };
