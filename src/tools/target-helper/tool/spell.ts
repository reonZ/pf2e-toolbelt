import {
    ChatMessagePF2e,
    createHTMLElement,
    htmlQuery,
    R,
    registerUpstreamHook,
    SpellPF2e,
} from "module-helpers";
import {
    addSaveBtnListener,
    createRollNPCSavesBtn,
    createSetTargetsBtn,
    createTargetsRows,
    TargetDataModelSource,
    TargetHelperTool,
    TargetsData,
    TargetsFlagData,
} from "..";

function prepareSpellMessage(
    this: TargetHelperTool,
    message: ChatMessagePF2e,
    updates: DeepPartial<TargetDataModelSource>
): updates is WithRequired<DeepPartial<TargetDataModelSource>, "type" | "save"> {
    const item = message.item as Maybe<SpellPF2e>;
    const save = item?.system.defense?.save;
    if (!save) return false;

    const dc = item.spellcasting?.statistic?.dc.value;
    if (!R.isNumber(dc)) return false;

    updates.type = "spell";
    updates.save = { ...save, dc, author: message.actor?.uuid };

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

    const damageBtn = htmlQuery(cardBtns, `[data-action="spell-damage"]`);
    const buttonsWrapper = createHTMLElement("div", { classes: ["pf2e-toolbelt-target-buttons"] });
    const fakeBtn = saveBtn.cloneNode(true) as HTMLButtonElement;

    delete fakeBtn.dataset.action;

    saveBtn.classList.add("hidden");
    saveBtn.after(buttonsWrapper);

    buttonsWrapper.append(fakeBtn);

    const setTargetsBtn = createSetTargetsBtn.call(this, data);
    buttonsWrapper.prepend(setTargetsBtn);

    const rollSavesBtn = createRollNPCSavesBtn.call(this, message, data);
    if (rollSavesBtn) {
        buttonsWrapper.append(rollSavesBtn);
    }

    if (damageBtn) {
        delete damageBtn.dataset.action;

        damageBtn.addEventListener("click", (event) => {
            const item = message.item;
            if (!item) return;

            const spell = item.isOfType("spell")
                ? item
                : item.isOfType("consumable")
                ? item.embeddedSpell
                : null;
            if (!spell) return;

            registerUpstreamHook(
                "preCreateChatMessage",
                (msg: ChatMessagePF2e) => {
                    const updates: DeepPartial<TargetDataModelSource> = {};
                    this.updateSourceFlag(msg, updates);
                    // updateSourceFlag(message, "messageId", messageId);
                    // updateSourceFlag(message, "save", save);
                },
                true
            );

            spell?.rollDamage(event);
        });
    }

    addSaveBtnListener.call(this, saveBtn, fakeBtn, message, data);
}

function isSpellMessage(message: ChatMessagePF2e): boolean {
    return message.getFlag("pf2e", "context.type") === "spell-cast";
}

export { isSpellMessage, prepareSpellMessage, renderSpellMessage };
