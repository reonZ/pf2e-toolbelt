import { SharedWrappersContainer } from "foundry-helpers";
import { ActorPF2e, ArmorPF2e, ChatMessagePF2e, WeaponPF2e } from "foundry-pf2e";

export const sharedWeaponPrepareBaseData = new SharedWrappersContainer<WeaponPF2e<ActorPF2e>, () => void, () => void>(
    "WRAPPER",
    "CONFIG.PF2E.Item.documentClasses.weapon.prototype.prepareBaseData",
    function (registered, wrapped) {
        for (const listener of registered) {
            listener();
        }

        wrapped();
    },
);

export const sharedArmorPrepareBaseData = new SharedWrappersContainer<ArmorPF2e<ActorPF2e>, () => void, () => void>(
    "WRAPPER",
    "CONFIG.PF2E.Item.documentClasses.armor.prototype.prepareBaseData",
    function (registered, wrapped) {
        for (const listener of registered) {
            listener();
        }

        wrapped();
    },
);

export const sharedMessageRenderHTML = new SharedWrappersContainer<
    ChatMessagePF2e,
    (...args: any[]) => Promise<HTMLElement>,
    (html: HTMLElement) => Promise<void>
>("WRAPPER", "ChatMessage.prototype.renderHTML", async function (registered, wrapped, _args) {
    const html = await wrapped();
    await Promise.all(registered.map((listener) => listener(html)));
    return html;
});
