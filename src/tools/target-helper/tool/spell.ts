import {
    ActorPF2e,
    ChatMessagePF2e,
    createHTMLElement,
    htmlQuery,
    R,
    registerUpstreamHook,
    SaveType,
    SpellPF2e,
} from "module-helpers";
import {
    addSaveBtnListener,
    createRollNPCSavesBtn,
    createSetTargetsBtn,
    createTargetsRows,
    TargetDataSource,
    TargetHelperTool,
    TargetsData,
    TargetsFlagData,
} from "..";

function prepareSpellMessage(
    this: TargetHelperTool,
    message: ChatMessagePF2e,
    updates: DeepPartial<TargetDataSource>
): updates is WithRequired<DeepPartial<TargetDataSource>, "type" | "save"> {
    const spellData = getSpellData(message);
    if (!spellData) return false;

    updates.type = "spell";

    if (!this.getMessageSave(message)) {
        const { dc, save } = spellData;
        updates.save = { ...save, dc, author: message.actor?.uuid };
    }

    return true;
}

async function renderSpellMessage(
    this: TargetHelperTool,
    message: ChatMessagePF2e,
    html: HTMLElement,
    flag: TargetsFlagData
) {
    const isGM = game.user.isGM;
    const data = new TargetsData(flag);
    const isAuthor = message.isAuthor;
    const msgContent = htmlQuery(html, ".message-content");
    if (!msgContent) return;

    if (data.hasTargets) {
        const rowsWrapper = createHTMLElement("div", {
            classes: ["pf2e-toolbelt-target-targetRows"],
        });

        for (const { row } of await createTargetsRows.call(this, message, data, false)) {
            rowsWrapper.append(row);
        }

        msgContent.append(rowsWrapper);
    }

    if (!isGM && !isAuthor) return;

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

    const spellData = getSpellData(message);
    if (!spellData) return;

    const { spell } = spellData;

    delete damageBtn.dataset.action;

    damageBtn.addEventListener("click", (event) => {
        // we cache the data & add the spell just in case
        const cached = data.clone({ type: "damage", item: data.item ?? spell.uuid }).toJSON();

        registerUpstreamHook(
            "preCreateChatMessage",
            (msg: ChatMessagePF2e) => {
                // we feed all the data to the damage message
                this.updateSourceFlag(msg, cached);
            },
            true
        );

        // we clean the spell message as we are not gonna use it anymore from that point on
        this.unsetFlag(message);

        spell?.rollDamage(event);
    });
}

function getSpellData(message: ChatMessagePF2e): {
    dc: number;
    save: { statistic: SaveType; basic: boolean };
    spell: SpellPF2e<ActorPF2e>;
} | null {
    const item = message.item;
    if (!item) return null;

    const spell = item.isOfType("spell")
        ? item
        : item.isOfType("consumable")
        ? item.embeddedSpell
        : null;

    if (!spell) return null;

    const save = spell?.system.defense?.save;
    if (!save) return null;

    const dc = spell?.spellcasting?.statistic?.dc.value;

    return R.isNumber(dc) ? { dc, save, spell } : null;
}

function isSpellMessage(message: ChatMessagePF2e): boolean {
    return message.getFlag("pf2e", "context.type") === "spell-cast";
}

export { isSpellMessage, prepareSpellMessage, renderSpellMessage };
