import {
    AreaAttack,
    ChatMessagePF2e,
    CreaturePF2e,
    isAreaOrAutoFireType,
    ItemPF2e,
    MeleePF2e,
    SYSTEM,
    WeaponPF2e,
} from "foundry-helpers";
import { TargetHelperTool } from ".";
import { SaveVariantsSource, TargetsDataSource } from "..";

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

export { isAreaMessage, prepareAreaMessage };
