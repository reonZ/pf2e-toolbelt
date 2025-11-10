import {
    ActorPF2e,
    ChatMessagePF2e,
    createHTMLElement,
    FlagData,
    getDragEventData,
    getItemFromUuid,
    htmlClosest,
    htmlQuery,
    ItemPF2e,
    MeleePF2e,
    MODULE,
    R,
    registerUpstreamHook,
    resolveActorAndItemFromHTML,
    SAVE_TYPES,
    SaveType,
    SpellPF2e,
    splitListString,
    WeaponPF2e,
} from "module-helpers";
import {
    addSaveBtnListener,
    addTargetsHeaders,
    createRollNPCSavesBtn,
    createSetTargetsBtn,
    TargetHelperTool,
} from ".";
import { TargetsData, TargetsDataModel, TargetsSaveSource } from "..";

function onChatMessageDrop(this: TargetHelperTool, event: DragEvent) {
    const target = htmlClosest<HTMLLIElement>(event.target, "li.chat-message");
    if (!target) return;

    const eventData = getDragEventData<SaveDragData>(event);
    if (!eventData || eventData.type !== `${MODULE.id}-check-roll`) return;

    const messageId = target.dataset.messageId;
    const message = messageId ? (game.messages.get(messageId) as ChatMessagePF2e) : undefined;
    const data = message && this.getTargetsFlagData(message);
    if (!data) return;

    if (!isMessageOwner(message)) {
        this.warning("drop.unauth");
        return;
    }

    if (data.saveVariants["null"]) {
        this.warning("drop.already");
        return;
    }

    data.updateSource(R.omit(eventData, ["type"]));
    data.setFlag();

    this.info("drop.added");
}

function getCurrentTargets(): TokenDocumentUUID[] {
    return R.pipe(
        Array.from(game.user.targets),
        R.filter((target) => !!target.actor?.isOfType("creature", "hazard", "vehicle")),
        R.map((target) => target.document.uuid)
    );
}

async function renderSpellCardLikeMessage(
    this: TargetHelperTool,
    message: ChatMessagePF2e,
    msgContent: HTMLElement,
    flag: TargetsFlagData,
    item: SpellPF2e | WeaponPF2e | MeleePF2e,
    saveBtnSelector: string,
    damageBtnSelector: string
): Promise<void> {
    const data = new TargetsData(flag, item.isOfType("spell") ? item.variantId : null);
    const save = data.save;
    if (!save) return;

    await addTargetsHeaders.call(this, message, data, msgContent);

    const saveBtn = htmlQuery(msgContent, saveBtnSelector);
    if (!(saveBtn instanceof HTMLButtonElement)) return;

    const buttonsWrapper = createHTMLElement("div", { classes: ["pf2e-toolbelt-target-buttons"] });
    const fakeSaveBtn = saveBtn.cloneNode(true) as HTMLButtonElement;

    fakeSaveBtn.dataset.save = "reflex";
    delete fakeSaveBtn.dataset.action;

    saveBtn.classList.add("hidden");
    saveBtn.after(buttonsWrapper);

    addSaveBtnListener.call(this, saveBtn, fakeSaveBtn, message, data);
    buttonsWrapper.append(fakeSaveBtn);

    if (!isMessageOwner(message)) return;

    const setTargetsBtn = createSetTargetsBtn.call(this, data);
    buttonsWrapper.prepend(setTargetsBtn);

    const rollSavesBtn = createRollNPCSavesBtn.call(this, message, data);
    if (rollSavesBtn) {
        buttonsWrapper.append(rollSavesBtn);
    }

    const damageBtn = htmlQuery(msgContent, damageBtnSelector);
    if (!damageBtn) return;

    damageBtn.addEventListener(
        "click",
        (event) => {
            // we cache the data & add the spell just in case
            const cached = data.toJSON({
                type: "damage",
                item: data.itemUUID ?? item.uuid,
                "==saveVariants": { null: save },
            });

            registerUpstreamHook(
                "preCreateChatMessage",
                (damageMessage: ChatMessagePF2e) => {
                    // we feed all the data to the damage message
                    this.updateSourceFlag(damageMessage, cached);
                },
                true
            );

            // we clean up the spell message as we are not gonna use it anymore
            this.unsetFlag(message);
        },
        true
    );
}

let BASIC_SAVE_REGEX: RegExp;
function getSaveLinkData(el: Maybe<Element | EventTarget>): SaveLinkData | null {
    if (!isValidSaveLink(el)) return null;

    const dataset = el.dataset;

    const dc = (() => {
        const adjustment = Number(dataset.pf2Adjustment) || 0;

        if ("pf2Dc" in dataset) {
            return Number(dataset.pf2Dc) + adjustment;
        }

        const actor = fromUuidSync<ItemPF2e>(dataset.itemUuid)?.actor;
        const statisticDc = actor?.getStatistic(dataset.against)?.dc.value;
        if (!statisticDc) return;

        return statisticDc + adjustment;
    })();

    if (dc == null || isNaN(dc)) return null;

    const { item } = resolveActorAndItemFromHTML(el);
    const data: SaveLinkData = {
        saveVariants: { null: { dc, basic: false, statistic: dataset.pf2Check } },
        item: item?.uuid,
        options: splitListString(dataset.pf2RollOptions ?? ""),
        traits: splitListString(dataset.pf2Traits ?? ""),
    };

    if (dataset.isBasic == null) {
        const label = el.querySelector("span.label")?.lastChild?.textContent?.trim();

        if (label) {
            if (!BASIC_SAVE_REGEX) {
                const saves = Object.values(CONFIG.PF2E.saves).map((x) => game.i18n.localize(x));
                const joined = game.i18n.format("PF2E.InlineCheck.BasicWithSave", {
                    save: `(${saves.join("|")})`,
                });
                BASIC_SAVE_REGEX = new RegExp(joined);
            }
            data.saveVariants["null"].basic = BASIC_SAVE_REGEX.test(label);
        }
    }

    return data;
}

function isValidSaveLink(el: Maybe<Element | EventTarget>): el is HTMLAnchorElement & {
    dataset: CheckLinkData;
} {
    if (!(el instanceof HTMLAnchorElement) || !el.classList.contains("inline-check")) {
        return false;
    }

    const { pf2Dc, against, itemUuid, pf2Check, rollerRole } = el.dataset;

    return (
        ((rollerRole !== "origin" && !!pf2Dc) || !!(against && itemUuid)) &&
        SAVE_TYPES.includes(pf2Check as SaveType)
    );
}

async function getItem(
    message: ChatMessagePF2e,
    data: TargetsData
): Promise<ItemPF2e<ActorPF2e> | null> {
    return ((await getItemFromUuid(data.itemUUID)) ?? message.item) as ItemPF2e<ActorPF2e> | null;
}

function isMessageOwner(message: ChatMessagePF2e) {
    return game.user.isGM || message.isAuthor;
}

type SaveDragData = SaveLinkData & {
    type: `${typeof MODULE.id}-check-roll`;
};

type AreaFireData = {
    author?: ActorUUID;
    saveVariants: { null: WithPartial<TargetsSaveSource, "saves"> };
    options: string[];
};

type SaveLinkData = {
    author?: ActorUUID;
    saveVariants: { null: WithPartial<TargetsSaveSource, "saves"> };
    options: string[];
    traits: string[];
    item: ItemUUID | undefined;
};

type CheckLinkData = {
    pf2Check: SaveType;
    pf2Adjustment?: `${number}`;
    pf2RollOptions?: string;
    pf2Traits?: string;
    isBasic?: boolean;
} & ({ against: string; itemUuid: string } | { pf2Dc: `${number}` });

type TargetsFlagData = FlagData<TargetsDataModel>;

export {
    getCurrentTargets,
    getItem,
    getSaveLinkData,
    isMessageOwner,
    onChatMessageDrop,
    renderSpellCardLikeMessage,
};
export type { AreaFireData, CheckLinkData, SaveDragData, SaveLinkData, TargetsFlagData };
