import {
    ChatMessagePF2e,
    CreaturePF2e,
    getMessageContext,
    htmlQuery,
    isAreaOrAutoFireType,
    ItemPF2e,
    MeleePF2e,
    WeaponPF2e,
} from "module-helpers";
import { renderSpellCardLikeMessage, TargetHelperTool, TargetsFlagData } from ".";
import { SaveVariantsSource, TargetsData, TargetsDataSource } from "..";

const EXTRA_AREA_OPTIONS = ["damaging-effect", "area-damage", "area-effect"];

function prepareAreaMessage(
    this: TargetHelperTool,
    message: ChatMessagePF2e,
    updates: DeepPartial<TargetsDataSource>,
): updates is WithRequired<DeepPartial<TargetsDataSource>, "type"> {
    const saveVariants = getAreaSaveVariants(message);
    if (!saveVariants) return false;

    updates.author = message.item?.actor.uuid;
    updates.type = "area";

    updates.options ??= [];
    updates.options.push(...EXTRA_AREA_OPTIONS);

    if (!this.getMessageSave(message)) {
        updates.saveVariants = saveVariants;
    }

    return true;
}

async function renderAreaMessage(
    this: TargetHelperTool,
    message: ChatMessagePF2e,
    html: HTMLElement,
    flag: TargetsFlagData,
) {
    const item = message.item;
    const msgContent = htmlQuery(html, ".message-content");
    if (!msgContent || !isValidItem(item)) return;

    const data = new TargetsData(flag);
    const save = data.save;
    if (!save) return;

    return renderSpellCardLikeMessage.call(
        this,
        message,
        msgContent,
        flag,
        item,
        `.message-buttons [data-action="roll-area-save"]`,
        `.message-buttons [data-action="roll-area-damage"]`,
    );
}

function isAreaMessage(message: ChatMessagePF2e): boolean {
    const context = getMessageContext(message);
    return isAreaOrAutoFireType(context?.type ?? "");
}

function getAreaSaveVariants(message: ChatMessagePF2e): SaveVariantsSource | null {
    const item = message.item;
    if (!isValidItem(item)) return null;

    const strike = item.actor.system.actions?.find((strike) => strike.item === item);
    if (!strike) return null;

    const statistic = strike.statistic ?? strike.altUsages?.at(0)?.statistic;
    if (!statistic) return null;

    return {
        null: {
            basic: true,
            dc: statistic.dc.value,
            statistic: "reflex",
        },
    };
}

function isValidItem(item: Maybe<ItemPF2e>): item is WeaponPF2e<CreaturePF2e> | MeleePF2e<CreaturePF2e> {
    return !!item?.isOfType("weapon", "melee") && !!item.actor?.isOfType("creature");
}

export { isAreaMessage, prepareAreaMessage, renderAreaMessage };
