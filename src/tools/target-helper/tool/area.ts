import {
    AreaAttack,
    ChatMessagePF2e,
    CreaturePF2e,
    htmlQuery,
    isAreaOrAutoFireType,
    ItemPF2e,
    MeleePF2e,
    SYSTEM,
    WeaponPF2e,
} from "foundry-helpers";
import { renderSpellCardLikeMessage, TargetHelperTool } from ".";
import { SaveVariantsSource, TargetHelper, TargetsData, TargetsDataSource } from "..";

const EXTRA_AREA_OPTIONS = ["damaging-effect", "area-damage", "area-effect"];

function isAreaMessage(message: ChatMessagePF2e): boolean {
    const context = message.flags[SYSTEM.id].context;
    return isAreaOrAutoFireType(context?.type ?? "");
}

function prepareAreaMessage(this: TargetHelperTool, message: ChatMessagePF2e, updates: TargetsDataSource): boolean {
    const saveVariants = getAreaSaveVariants(message);
    if (!saveVariants) return false;

    updates.author = message.item?.actor.uuid;
    updates.type = "area";

    updates.options ??= [];
    updates.options.push(...EXTRA_AREA_OPTIONS);

    if (!this.getMessageSaveVariants(message)) {
        updates.saveVariants = saveVariants;
    }

    return true;
}

async function renderAreaMessage(
    this: TargetHelperTool,
    message: ChatMessagePF2e,
    html: HTMLElement,
    data: TargetsData,
) {
    const item = message.item;
    const msgContent = htmlQuery(html, ".message-content");
    if (!msgContent || !isValidItem(item)) return;

    return renderSpellCardLikeMessage.call(
        this,
        message,
        msgContent,
        data,
        item,
        `.message-buttons [data-action="roll-area-save"]`,
        `.message-buttons [data-action="roll-area-damage"]`,
    );
}

function getAreaSaveVariants(message: ChatMessagePF2e): SaveVariantsSource | null {
    const item = message.item;
    if (!isValidItem(item)) return null;

    const strike = item.actor.system.actions?.find((strike): strike is AreaAttack => strike.item === item);
    if (!strike) return null;

    const statistic = strike.statistic ?? (strike.altUsages?.at(0) as Maybe<AreaAttack>)?.statistic;
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
