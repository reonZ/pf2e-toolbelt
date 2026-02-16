import { ActorPF2e, ChatMessagePF2e, R, SpellPF2e } from "foundry-helpers";
import { TargetHelperTool } from ".";
import { SaveVariantSource, SaveVariantsSource, TargetsDataSource } from "..";

function prepareSpellMessage(
    this: TargetHelperTool,
    message: ChatMessagePF2e,
    updates: DeepPartial<TargetsDataSource>,
): boolean {
    const saveVariants = getSpellSaveVariants(message);
    if (!saveVariants) return false;

    updates.type = "spell";

    if (!this.getMessageSaveVariants(message)) {
        updates.saveVariants = saveVariants;
    }

    return true;
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

            const save = foundry.utils.mergeObject(baseSave ?? {}, { dc, ...override }, { inplace: false });

            if (save.statistic) {
                saveVariants[id] = save as Omit<SaveVariantSource, "saves">;
            }
        }

        return saveVariants;
    } else if (baseSave) {
        return { null: { dc, ...baseSave } };
    }

    return null;
}

function getMessageSpell(message: ChatMessagePF2e): SpellPF2e<ActorPF2e> | null {
    const item = message.item;
    if (!item) return null;

    return item.isOfType("spell") ? item : item.isOfType("consumable") ? item.embeddedSpell : null;
}

export { prepareSpellMessage, getSpellSaveVariants };
