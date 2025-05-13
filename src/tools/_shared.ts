import { createSharedWrapper } from "module-helpers";

const sharedWeaponPrepareBaseData = createSharedWrapper(
    "WRAPPER",
    "CONFIG.PF2E.Item.documentClasses.weapon.prototype.prepareBaseData",
    function (registered, wrapped) {
        for (const listener of registered) {
            listener();
        }

        wrapped();
    }
);

const sharedArmorPrepareBaseData = createSharedWrapper(
    "WRAPPER",
    "CONFIG.PF2E.Item.documentClasses.armor.prototype.prepareBaseData",
    function (registered, wrapped) {
        for (const listener of registered) {
            listener();
        }

        wrapped();
    }
);

export { sharedArmorPrepareBaseData, sharedWeaponPrepareBaseData };
