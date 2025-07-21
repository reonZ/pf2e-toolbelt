import {
    ActorPF2e,
    ChatMessagePF2e,
    FlagData,
    getDragEventData,
    getItemFromUuid,
    htmlClosest,
    ItemPF2e,
    MODULE,
    R,
    resolveActorAndItemFromHTML,
    SAVE_TYPES,
    SaveType,
    splitListString,
} from "module-helpers";
import { TargetHelperTool } from ".";
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

export { getCurrentTargets, getItem, getSaveLinkData, isMessageOwner, onChatMessageDrop };
export type { CheckLinkData, SaveDragData, SaveLinkData, TargetsFlagData };
