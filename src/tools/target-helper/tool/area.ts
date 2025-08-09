import {
    CharacterPF2e,
    ChatMessagePF2e,
    htmlQuery,
    ItemPF2e,
    Statistic,
    WeaponPF2e,
} from "module-helpers";
import { renderSpellCardLikeMessage, TargetHelperTool, TargetsFlagData } from ".";
import { SaveVariantsSource, TargetsData, TargetsDataSource } from "..";

const EXTRA_AREA_OPTIONS = ["damaging-effect", "area-damage", "area-effect"];

function prepareAreaMessage(
    this: TargetHelperTool,
    message: ChatMessagePF2e,
    updates: DeepPartial<TargetsDataSource>
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
    flag: TargetsFlagData
) {
    const weapon = message.item;
    const msgContent = htmlQuery(html, ".message-content");
    if (!msgContent || !isValidWeapon(weapon)) return;

    const data = new TargetsData(flag);
    const save = data.save;
    if (!save) return;

    return renderSpellCardLikeMessage.call(this, message, msgContent, flag, weapon, (event) => {
        const action = weapon.actor.system.actions.find((a) => a.item.uuid === weapon?.uuid);
        action?.damage?.({ options: EXTRA_AREA_OPTIONS });
    });
}

function isAreaMessage(message: ChatMessagePF2e): boolean {
    return message.flags["sf2e-anachronism"]?.type === "area-fire";
}

function getAreaSaveVariants(message: ChatMessagePF2e): SaveVariantsSource | null {
    const weapon = message.item;
    if (!isValidWeapon(weapon)) return null;

    const savingThrow = calculateSaveDC(weapon);
    return {
        null: {
            basic: true,
            dc: savingThrow.dc.value,
            statistic: "reflex",
        },
    };
}

function isValidWeapon(item: Maybe<ItemPF2e>): item is WeaponPF2e<CharacterPF2e> {
    return !!item?.isOfType("weapon") && !!item.actor?.isOfType("character");
}

/**
 * https://github.com/TikaelSol/sf2e-anachronism/blob/28ab37351cd4deb1f68f56ac6b6e42b7a3c373c5/module/actions/area-fire.mjs#L146C1-L152C2
 */
function calculateSaveDC(weapon: WeaponPF2e<CharacterPF2e>): Statistic<CharacterPF2e> {
    const ModifierPF2e = game.pf2e.Modifier;
    const actor = weapon.actor;
    const classDC = actor.getStatistic("class");
    const itemBonus = new ModifierPF2e({
        label: "Tracking Bonus",
        type: "item",
        modifier: weapon.flags.pf2e.attackItemBonus,
    });
    return classDC.extend({ modifiers: itemBonus.modifier ? [itemBonus] : [] });
}

export { getAreaSaveVariants, isAreaMessage, prepareAreaMessage, renderAreaMessage };
