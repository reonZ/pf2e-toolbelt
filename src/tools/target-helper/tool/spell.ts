import {
    ActorPF2e,
    ChatMessagePF2e,
    createHTMLElement,
    htmlQuery,
    MeleePF2e,
    R,
    registerUpstreamHook,
    SpellPF2e,
    WeaponPF2e,
} from "foundry-helpers";
import {
    addSaveBtnListener,
    addTargetsHeaders,
    createRollNPCSavesBtn,
    createSetTargetsBtn,
    isMessageOwner,
    TargetHelperTool,
} from ".";
import { SaveVariantSource, SaveVariantsSource, TargetHelper, TargetsData, TargetsDataSource } from "..";

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

async function renderSpellCardLikeMessage(
    this: TargetHelperTool,
    message: ChatMessagePF2e,
    msgContent: HTMLElement,
    data: TargetsData,
    item: SpellPF2e | WeaponPF2e | MeleePF2e,
    saveBtnSelector: string,
    damageBtnSelector: string,
): Promise<void> {
    const targetHelper = new TargetHelper(data, item.isOfType("spell") ? item.variantId : "null");
    const save = targetHelper.saveVariant;
    if (!save) return;

    await addTargetsHeaders.call(this, message, targetHelper, msgContent);

    const saveBtn = htmlQuery(msgContent, saveBtnSelector);
    if (!(saveBtn instanceof HTMLButtonElement)) return;

    const buttonsWrapper = createHTMLElement("div", { classes: ["pf2e-toolbelt-target-buttons"] });
    const fakeSaveBtn = saveBtn.cloneNode(true) as HTMLButtonElement;

    fakeSaveBtn.dataset.save = "reflex";
    delete fakeSaveBtn.dataset.action;

    saveBtn.classList.add("hidden");
    saveBtn.after(buttonsWrapper);

    addSaveBtnListener.call(this, saveBtn, fakeSaveBtn, message, targetHelper);
    buttonsWrapper.append(fakeSaveBtn);

    if (!isMessageOwner(message)) return;

    const setTargetsBtn = createSetTargetsBtn.call(this, message, targetHelper);
    buttonsWrapper.prepend(setTargetsBtn);

    const rollSavesBtn = createRollNPCSavesBtn.call(this, message, targetHelper);
    if (rollSavesBtn) {
        buttonsWrapper.append(rollSavesBtn);
    }

    const damageBtn = htmlQuery(msgContent, damageBtnSelector);
    if (!damageBtn) return;

    damageBtn.addEventListener(
        "click",
        (event) => {
            // we cache the data & add the spell just in case
            const cached = targetHelper.encode({
                type: "damage",
                item: targetHelper.itemUUID ?? item.uuid,
                "==saveVariants": { null: save },
            });

            registerUpstreamHook(
                "preCreateChatMessage",
                (damageMessage: ChatMessagePF2e) => {
                    // we feed all the data to the damage message
                    this.updateSourceFlag(damageMessage, cached);
                },
                true,
            );

            // we clean up the spell message as we are not gonna use it anymore
            this.unsetFlag(message);
        },
        true,
    );
}

function getMessageSpell(message: ChatMessagePF2e): SpellPF2e<ActorPF2e> | null {
    const item = message.item;
    if (!item) return null;

    return item.isOfType("spell") ? item : item.isOfType("consumable") ? item.embeddedSpell : null;
}

export { getSpellSaveVariants, prepareSpellMessage, renderSpellCardLikeMessage };
