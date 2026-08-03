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
    if (!spell) return null;

    const dc: number | undefined = spell.spellcasting?.statistic?.withRollOptions({ item: spell }).dc.value;
    if (!R.isNumber(dc)) return null;

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

async function renderSpellMessage(
    this: TargetHelperTool,
    message: ChatMessagePF2e,
    html: HTMLElement,
    data: TargetsData,
) {
    const spell = getMessageSpell(message);
    const msgContent = htmlQuery(html, ".message-content");
    if (!msgContent || !spell) return;
    if (spell.hasVariants && !spell.variantId) return;

    const targetHelper = new TargetHelper(data, spell.variantId);

    return renderSpellCardLikeMessage.call(
        this,
        message,
        msgContent,
        targetHelper,
        spell,
        `.card-buttons [data-action="spell-save"]`,
        `.card-buttons [data-action="spell-damage"]`,
    );
}

async function renderSpellCardLikeMessage(
    this: TargetHelperTool,
    message: ChatMessagePF2e,
    msgContent: HTMLElement,
    data: TargetHelper,
    item: SpellPF2e | WeaponPF2e | MeleePF2e,
    saveBtnSelector: string,
    damageBtnSelector: string,
): Promise<void> {
    const save = data.saveVariant;
    if (!save) return;

    await addTargetsHeaders.call(this, message, data, msgContent);

    const saveBtn = htmlQuery(msgContent, saveBtnSelector);
    if (!(saveBtn instanceof HTMLButtonElement)) return;

    const buttonsWrapper = createHTMLElement("div", { classes: ["pf2e-toolbelt-target-buttons"] });
    const fakeSaveBtn = saveBtn.cloneNode(true) as HTMLButtonElement;

    fakeSaveBtn.dataset.save = "reflex";
    delete fakeSaveBtn.dataset.action;

    saveBtn.classList.add("hidden");
    saveBtn.after(buttonsWrapper);

    addSaveBtnListener.call(this, saveBtn, fakeSaveBtn, message, data);
    buttonsWrapper.append(fakeSaveBtn);

    if (!isMessageOwner(message)) return;

    const setTargetsBtn = createSetTargetsBtn.call(this, message, data);
    buttonsWrapper.prepend(setTargetsBtn);

    const rollSavesBtn = createRollNPCSavesBtn.call(this, message, data);
    if (rollSavesBtn) {
        buttonsWrapper.append(rollSavesBtn);
    }

    // weapons that don't deal damage shouldn't even have a damage button, but they do so..
    if (!item.isOfType("spell") && !item.dealsDamage) return;

    const damageBtn = htmlQuery(msgContent, damageBtnSelector);
    if (!damageBtn) return;

    damageBtn.addEventListener(
        "click",
        () => {
            // we cache the data & add the spell just in case
            const cached = data.encode({
                type: "damage",
                item: data.itemUUID ?? item.uuid,
                saveVariants: _replace({ null: save }),
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

export { getSpellSaveVariants, prepareSpellMessage, renderSpellCardLikeMessage, renderSpellMessage };
