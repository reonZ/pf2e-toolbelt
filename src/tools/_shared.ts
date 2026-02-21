import {
    ActorPF2e,
    ArmorPF2e,
    CharacterPF2e,
    CharacterSheetPF2e,
    ChatMessagePF2e,
    createSharedWrapper,
    WeaponPF2e,
} from "foundry-helpers";

const sharedWeaponPrepareBaseData = createSharedWrapper<WeaponPF2e<ActorPF2e>, () => void, () => void>(
    "WRAPPER",
    "CONFIG.PF2E.Item.documentClasses.weapon.prototype.prepareBaseData",
    function (registered, wrapped) {
        for (const listener of registered) {
            listener();
        }

        wrapped();
    },
);

const sharedArmorPrepareBaseData = createSharedWrapper<ArmorPF2e<ActorPF2e>, () => void, () => void>(
    "WRAPPER",
    "CONFIG.PF2E.Item.documentClasses.armor.prototype.prepareBaseData",
    function (registered, wrapped) {
        for (const listener of registered) {
            listener();
        }

        wrapped();
    },
);

const sharedMessageRenderHTML = createSharedWrapper<
    ChatMessagePF2e,
    (...args: any[]) => Promise<HTMLElement>,
    (html: HTMLElement) => Promise<void>
>("WRAPPER", "ChatMessage.prototype.renderHTML", async function (registered, wrapped, _args) {
    const html = await wrapped();
    await Promise.all(registered.map((listener) => listener(html)));
    return html;
});

const sharedCharacterSheetActivateListeners = createSharedWrapper<
    CharacterSheetPF2e<CharacterPF2e>,
    ($html: JQuery) => void,
    (html: HTMLElement) => void
>(
    "WRAPPER",
    "CONFIG.Actor.sheetClasses.character['pf2e.CharacterSheetPF2e'].cls.prototype.activateListeners",
    function (registered, wrapped, [$html]) {
        wrapped();

        const html = $html[0];

        for (const listener of registered) {
            listener(html);
        }
    },
);

export {
    sharedArmorPrepareBaseData,
    sharedCharacterSheetActivateListeners,
    sharedMessageRenderHTML,
    sharedWeaponPrepareBaseData,
};
