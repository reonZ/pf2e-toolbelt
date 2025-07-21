import {
    ActorPF2e,
    ChatMessagePF2e,
    createHTMLElement,
    htmlQuery,
    R,
    registerUpstreamHook,
    SpellOverlayOverride,
    SpellPF2e,
} from "module-helpers";
import {
    addSaveBtnListener,
    addTargetsHeaders,
    createRollNPCSavesBtn,
    createSetTargetsBtn,
    isMessageOwner,
    SaveVariantsSource,
    TargetHelperTool,
    TargetsData,
    TargetsDataSource,
    TargetsFlagData,
    TargetsSaveSource,
} from "..";

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

    const data = new TargetsData(flag, spell.variantId);
    const save = data.save;
    if (!save) return;

    await addTargetsHeaders.call(this, message, data, msgContent);

    if (!isMessageOwner(message)) return;

    const cardBtns = htmlQuery(msgContent, ".card-buttons");
    const saveBtn = htmlQuery<HTMLButtonElement>(cardBtns, `[data-action="spell-save"]`);
    if (!saveBtn) return;

    const buttonsWrapper = createHTMLElement("div", { classes: ["pf2e-toolbelt-target-buttons"] });

    const fakeSaveBtn = saveBtn.cloneNode(true) as HTMLButtonElement;
    delete fakeSaveBtn.dataset.action;

    saveBtn.classList.add("hidden");
    saveBtn.after(buttonsWrapper);

    addSaveBtnListener.call(this, saveBtn, fakeSaveBtn, message, data);
    buttonsWrapper.append(fakeSaveBtn);

    const setTargetsBtn = createSetTargetsBtn.call(this, data);
    buttonsWrapper.prepend(setTargetsBtn);

    const rollSavesBtn = createRollNPCSavesBtn.call(this, message, data);
    if (rollSavesBtn) {
        buttonsWrapper.append(rollSavesBtn);
    }

    const damageBtn = htmlQuery(cardBtns, `[data-action="spell-damage"]`);
    if (!damageBtn) return;

    delete damageBtn.dataset.action;

    damageBtn.addEventListener("click", (event) => {
        // we cache the data & add the spell just in case
        const cached = data.toJSON({
            type: "damage",
            item: data.itemUUID ?? spell.uuid,
            "==saveVariants": { null: save },
        });

        registerUpstreamHook(
            "preCreateChatMessage",
            (damageMessage: ChatMessagePF2e) => {
                // we feed all the data to the damage message
                this.updateSourceFlag(damageMessage, cached);
            },
            true
        );

        // we clean up the spell message as we are not gonna use it anymore
        this.unsetFlag(message);

        spell.rollDamage(event);
    });
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
        const overlays = spell.overlays.contents as (SpellOverlayOverride & { _id: string })[];

        return R.pipe(
            overlays,
            R.map(({ _id, system }) => {
                if (system?.defense === null) return;

                const override = system?.defense?.save;
                if (!override && !baseSave) return;

                const save = foundry.utils.mergeObject(
                    baseSave ?? {},
                    { dc, ...override },
                    { inplace: false }
                ) as Omit<TargetsSaveSource, "saves">;

                return [_id, save] as const;
            }),
            R.filter(R.isTruthy),
            R.mapToObj(([id, save]) => [id, save])
        );
    } else if (baseSave) {
        return { null: { dc, ...baseSave } };
    }

    return null;
}

export { getMessageSpell, getSpellSaveVariants, prepareSpellMessage, renderSpellMessage };
