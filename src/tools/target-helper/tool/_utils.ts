import {
    ActorUUID,
    ChatMessagePF2e,
    ItemPF2e,
    ItemUUID,
    resolveActorAndItemFromHTML,
    SaveType,
    splitListString,
} from "foundry-helpers";
import { SAVE_TYPES } from "foundry-helpers/dist";
import { SaveVariantSource } from "..";

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
        ((rollerRole !== "origin" && !!pf2Dc) || !!(against && itemUuid)) && SAVE_TYPES.includes(pf2Check as SaveType)
    );
}

function isMessageOwner(message: ChatMessagePF2e) {
    return game.user.isGM || message.isAuthor;
}

type SaveDragData = SaveLinkData & {
    type: `${string}-check-roll`;
};

type SaveLinkData = {
    author?: ActorUUID;
    saveVariants: { null: SaveVariantSource };
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

export { getSaveLinkData, isMessageOwner };
export type { SaveDragData, SaveLinkData };
