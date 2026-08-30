import {
    ActorPF2e,
    ArmorPF2e,
    CharacterPF2e,
    CharacterSheetPF2e,
    ChatMessagePF2e,
    createSharedWrapper,
    FamiliarPF2e,
    FamiliarSheetData,
    FamiliarSheetPF2e,
    NPCPF2e,
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

const sharedCharacterPrepareData = createSharedWrapper<CharacterPF2e, () => void, () => void>(
    "WRAPPER",
    "CONFIG.PF2E.Actor.documentClasses.character.prototype.prepareData",
    function (registered, wrapped) {
        wrapped();

        for (const listener of registered) {
            listener();
        }
    },
);

const sharedNpcPrepareData = createSharedWrapper<NPCPF2e, () => void, () => void>(
    "WRAPPER",
    "CONFIG.PF2E.Actor.documentClasses.npc.prototype.prepareData",
    function (registered, wrapped) {
        wrapped();

        for (const listener of registered) {
            listener();
        }
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

const sharedFamiliarSheetGetData = createSharedWrapper<
    FamiliarSheetPF2e<FamiliarPF2e>,
    (...args: any[]) => Promise<FamiliarSheetData<FamiliarPF2e>>,
    (data: FamiliarSheetData<FamiliarPF2e>) => Promise<void>
>(
    "WRAPPER",
    "CONFIG.Actor.sheetClasses.familiar['pf2e.FamiliarSheetPF2e'].cls.prototype.getData",
    async function (registered, wrapped) {
        const data = await wrapped();
        await Promise.all(registered.map((listener) => listener(data)));
        return data;
    },
);

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
    sharedCharacterPrepareData,
    sharedCharacterSheetActivateListeners,
    sharedFamiliarSheetGetData,
    sharedMessageRenderHTML,
    sharedNpcPrepareData,
    sharedWeaponPrepareBaseData,
};
