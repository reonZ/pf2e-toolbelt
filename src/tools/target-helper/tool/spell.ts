import { ActorPF2e, ChatMessagePF2e, htmlQuery, R, SpellPF2e } from "module-helpers";
import { renderSpellCardLikeMessage, TargetHelperTool, TargetsFlagData } from ".";
import { SaveVariantsSource, TargetsDataSource, TargetsSaveSource } from "..";

function prepareSpellMessage(
    this: TargetHelperTool,
    message: ChatMessagePF2e,
    updates: DeepPartial<TargetsDataSource>
): updates is WithRequired<DeepPartial<TargetsDataSource>, "type" | "saveVariants"> {
    const saveVariants = getSpellSaveVariants(message);
    if (!saveVariants) return false;

    updates.type = "spell";

    if (!this.getMessageSave(message)) {
        updates.saveVariants = saveVariants;
    }

    return true;
}

async function renderSpellMessage(
    this: TargetHelperTool,
    message: ChatMessagePF2e,
    html: HTMLElement,
    flag: TargetsFlagData
) {
    const spell = getMessageSpell(message);
    const msgContent = htmlQuery(html, ".message-content");
    if (!msgContent || !spell) return;
    if (spell.hasVariants && !spell.variantId) return;

    return renderSpellCardLikeMessage.call(
        this,
        message,
        msgContent,
        flag,
        spell,
        `.card-buttons [data-action="spell-save"]`,
        `.card-buttons [data-action="spell-damage"]`
    );
}

function getMessageSpell(message: ChatMessagePF2e): SpellPF2e<ActorPF2e> | null {
    const item = message.item;
    if (!item) return null;

    return item.isOfType("spell") ? item : item.isOfType("consumable") ? item.embeddedSpell : null;
}

function getSpellSaveVariants(message: ChatMessagePF2e): SaveVariantsSource | null {
    const spell = getMessageSpell(message);
    const dc = spell?.spellcasting?.statistic?.dc.value;
    if (!spell || !R.isNumber(dc)) return null;

    const baseSave = spell?.system.defense?.save;

    if (spell.hasVariants) {
        const saveVariants: SaveVariantsSource = {};

        for (const [id, { system }] of spell.overlays.entries()) {
            if (system?.defense === null) continue;

            const override = system?.defense?.save;
            if (!baseSave && !override) continue;

            const save = foundry.utils.mergeObject(
                baseSave ?? {},
                { dc, ...override },
                { inplace: false }
            ) as Omit<TargetsSaveSource, "saves">;

            if (save.statistic) {
                saveVariants[id] = save;
            }
        }

        return saveVariants;
    } else if (baseSave) {
        return { null: { dc, ...baseSave } };
    }

    return null;
}

export { getMessageSpell, getSpellSaveVariants, prepareSpellMessage, renderSpellMessage };
