import {
    calculateSaveDC,
    CharacterPF2e,
    ChatMessagePF2e,
    EXTRA_AREA_OPTIONS,
    htmlQuery,
    ItemPF2e,
    WeaponPF2e,
} from "module-helpers";
import { renderSpellCardLikeMessage, TargetHelperTool, TargetsFlagData } from ".";
import { SaveVariantsSource, TargetsData, TargetsDataSource } from "..";

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

export { getAreaSaveVariants, isAreaMessage, prepareAreaMessage, renderAreaMessage };
