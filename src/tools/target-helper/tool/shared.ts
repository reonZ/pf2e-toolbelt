import {
    ChatMessagePF2e,
    FlagDataModel,
    getDragEventData,
    htmlClosest,
    ItemPF2e,
    MODULE,
    R,
    resolveActorAndItemFromHTML,
    SaveType,
    splitListString,
} from "module-helpers";
import { TargetHelperTool } from ".";
import { TargetsDataModel } from "..";

function onChatMessageDrop(this: TargetHelperTool, event: DragEvent) {
    const target = htmlClosest<HTMLLIElement>(event.target, "li.chat-message");
    if (!target) return;

    const eventData = getDragEventData<SaveDragData>(event);
    if (!eventData || eventData.type !== `${MODULE.id}-check-roll`) return;

    const messageId = target.dataset.messageId;
    const message = messageId ? (game.messages.get(messageId) as ChatMessagePF2e) : undefined;
    const data = message && this.getTargetsFlagData(message);
    if (!data) return;

    if (!game.user.isGM && !message.isAuthor) {
        this.warning("drop.unauth");
        return;
    }

    if (data.save) {
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
function getSaveLinkData(el: HTMLAnchorElement & { dataset: CheckLinkData }): SaveLinkData | null {
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
        save: { dc, basic: false, statistic: dataset.pf2Check },
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
            data.save.basic = BASIC_SAVE_REGEX.test(label);
        }
    }

    return data;
}

type SaveDragData = SaveLinkData & {
    type: `${typeof MODULE.id}-check-roll`;
};

type SaveLinkData = {
    save: Exclude<toolbelt.targetHelper.MessageFlag["save"], undefined>;
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

type TargetsFlagData = FlagDataModel<TargetsDataModel, ChatMessagePF2e>;

export { getCurrentTargets, getSaveLinkData, onChatMessageDrop };
export type { CheckLinkData, SaveDragData, SaveLinkData, TargetsFlagData };
