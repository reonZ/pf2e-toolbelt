import {
    actorItems,
    addListenerAll,
    ChatMessagePF2e,
    createHTMLElement,
    DamageRoll,
    DegreeOfSuccessString,
    ErrorPF2e,
    extractEphemeralEffects,
    getChoiceSetSelection,
    htmlClosest,
    htmlQuery,
    htmlQueryAll,
    isInstanceOf,
    R,
    removeIndexFromArray,
    TokenDocumentPF2e,
} from "module-helpers";
import {
    createRollNPCSavesBtn,
    createSetTargetsBtn,
    createTargetsRows,
    getSpellData,
    isMessageOwner,
    onChatMessageDrop,
    TargetHelperTool,
    TargetsFlagData,
} from ".";
import { TargetsDataSource, TargetsData } from "..";

function prepareDamageMessage(
    this: TargetHelperTool,
    message: DamageMessage,
    updates: DeepPartial<TargetsDataSource>
): updates is WithRequired<DeepPartial<TargetsDataSource>, "type" | "isRegen"> {
    if (isPersistentDamageMessage(message)) return false;

    updates.type = "damage";
    updates.isRegen = isRegenMessage(message);

    if (!this.getMessageSave(message)) {
        const spellData = getSpellData(message);

        if (spellData) {
            const { dc, save } = spellData;
            updates.save = { ...save, dc, author: message.actor?.uuid };
        }
    }

    if (updates.isRegen) {
        const token = message.token;
        updates.targets = token ? [token.uuid] : [];
    }

    if (message.rolls.length === 2) {
        const splashRollIndex = message.rolls.findIndex((roll) => roll.options.splashOnly);
        const regularRollIndex = message.rolls.findIndex((roll: DamageRoll) => {
            return (
                !roll.options.splashOnly &&
                roll.options.damage?.modifiers?.some((modifier) => {
                    return (
                        ("category" in modifier && modifier.category === "splash") ||
                        ("damageCategory" in modifier && modifier.damageCategory === "splash")
                    );
                })
            );
        });

        if (splashRollIndex !== -1 && regularRollIndex !== -1) {
            updates.splashIndex = splashRollIndex;
        }
    }

    return true;
}

async function renderDamageMessage(
    this: TargetHelperTool,
    message: ChatMessagePF2e,
    html: HTMLElement,
    flag: TargetsFlagData
) {
    const msgContent = htmlQuery(html, ".message-content");
    if (!msgContent) return;

    const isOwner = isMessageOwner(message);
    const data = new TargetsData(flag);
    const hasTargets = data.hasTargets;
    const hasSplashTargets = data.hasSplashTargets;
    if (!hasTargets && !hasSplashTargets && !isOwner) return;

    const damageRows = htmlQueryAll(msgContent, ".damage-application");
    const diceTotalElements = msgContent.querySelectorAll(".dice-result .dice-total");
    const wrappersParents = diceTotalElements.length
        ? diceTotalElements
        : msgContent.querySelectorAll(".dice-result .dice-formula");
    if (!damageRows.length && !wrappersParents.length) return;

    const hasSplashDamage = data.hasSplashDamage;
    const [btnWrapper, splashWrapper] = R.times(2, () => {
        return createHTMLElement("div", { classes: ["pf2e-toolbelt-target-buttons"] });
    });

    if (hasTargets) {
        const rows = removeIndexFromArray(damageRows, data.splashIndex);
        const toggleBtn = createDamageToggleBtn.call(this, rows);
        btnWrapper.append(toggleBtn);
    }

    if (hasSplashDamage && (hasTargets || hasSplashTargets)) {
        const row = damageRows[data.splashIndex];
        const toggleBtn = createDamageToggleBtn.call(this, [row]);
        splashWrapper.append(toggleBtn);
    }

    if (isOwner) {
        const setTargetsBtn = createSetTargetsBtn.call(this, data);
        btnWrapper.append(setTargetsBtn);

        if (hasSplashDamage) {
            const setSplashTargetBtn = createSetTargetsBtn.call(this, data, true);
            splashWrapper.append(setSplashTargetBtn);
        }

        html.classList.add("pf2e-toolbelt-damage");
        html.addEventListener("drop", onChatMessageDrop.bind(this));
    }

    const rollSavesBtn = createRollNPCSavesBtn.call(this, message, data);
    if (rollSavesBtn) {
        btnWrapper.append(rollSavesBtn);
    }

    wrappersParents[0].append(btnWrapper);

    if (hasSplashDamage) {
        wrappersParents[data.splashIndex]?.append(splashWrapper);
    }

    if (!hasTargets && !hasSplashTargets) return;

    const originActor = message.actor;
    const showResults =
        game.user.isGM ||
        game.pf2e.settings.metagame.results ||
        !originActor ||
        originActor.isOwner ||
        !!originActor.hasPlayerOwner;

    const rowsWrapper = createHTMLElement("div", {
        classes: ["pf2e-toolbelt-target-targetRows", "pf2e-toolbelt-target-damage"],
    });

    const smallButtons = this.settings.small;
    const clonedDamageRows = damageRows.map((el) => {
        const clone = el.cloneNode(true) as HTMLElement;

        clone.classList.remove("hidden");

        if (smallButtons) {
            clone.classList.add("small");
        }

        const actionElements = clone.querySelectorAll<HTMLElement>("[data-action]");

        for (const actionElement of actionElements) {
            const action = actionElement.dataset.action;
            actionElement.dataset.action = `target-${action}`;
        }

        return clone;
    });

    for (const targetData of await createTargetsRows.call(this, message, data, true)) {
        const { row, target, type, isOwner, save } = targetData;

        rowsWrapper.append(row);

        if (!isOwner) continue;

        const targetActor = target.actor;
        const applied = data.targetApplied(target.id);

        for (let i = 0; i < clonedDamageRows.length; i++) {
            if (type === "splashTargets" && i !== data.splashIndex) continue;

            const clonedDamageRow = clonedDamageRows[i];
            const clone = clonedDamageRow.cloneNode(true) as HTMLElement;

            clone.dataset.targetRollIndex = String(i);
            clone.dataset.targetUuid = target.uuid;

            clone.classList.toggle(
                "applied",
                !!applied[i] || (!!save?.basic && save.success === "criticalSuccess" && showResults)
            );

            if (save?.success && data.isBasicSave) {
                const success: DegreeOfSuccessString = (() => {
                    if (
                        save.unadjustedOutcome !== "failure" ||
                        !targetActor?.isOfType("character") ||
                        targetActor.saves[save.statistic].rank !== 4
                    ) {
                        return save.success;
                    }

                    for (const item of actorItems(targetActor, "feat")) {
                        const sourceId = item.sourceId;
                        if (!sourceId) continue;

                        if (sourceId === TargetHelperTool.THIRD_PATH_TO_PERFECTION) {
                            const selection = getChoiceSetSelection(item, {
                                flag: "pathToPerfection",
                            });

                            if (selection === save.statistic) {
                                return "success";
                            }
                        } else if (TargetHelperTool.LEGENDARY_SAVES.includes(sourceId)) {
                            return "success";
                        }
                    }

                    return save.success;
                })();

                if (showResults) {
                    clone.classList.add(success);
                }
            }

            addListenerAll(clone, "[data-action]", (el, event) => {
                onDamageBtnClick.call(this, event, el, target, message, data);
            });

            row.append(clone);
        }
    }

    msgContent.append(rowsWrapper);
}

function createDamageToggleBtn(this: TargetHelperTool, rows: HTMLElement[]): HTMLElement {
    const toggleBtn = createHTMLElement("button", {
        classes: ["pf2e-toolbelt-target-toggleDamageRows"],
        content: `<i class="fa-solid fa-plus expand"></i><i class="fa-solid fa-minus collapse"></i>`,
    });

    toggleBtn.title = this.localize("damage.toggle");
    toggleBtn.addEventListener("click", (event) => {
        event.stopPropagation();

        toggleBtn.classList.toggle("expanded");

        for (const damageRow of rows) {
            damageRow.classList.toggle("hidden");
        }
    });

    for (const damageRow of rows) {
        damageRow.classList.add("hidden");
    }

    return toggleBtn;
}

function onDamageBtnClick(
    this: TargetHelperTool,
    event: MouseEvent,
    btn: HTMLElement,
    target: TokenDocumentPF2e,
    message: ChatMessagePF2e,
    data: TargetsData
) {
    type Action = "target-applyDamage" | "target-shieldBlock";

    const { action, multiplier } = btn.dataset as { action: Action; multiplier: `${number}` };

    if (action === "target-shieldBlock") {
        if (!btn.classList.contains("shield-activated")) {
            toggleOffShieldBlock(message.id);
        }

        btn.classList.toggle("shield-activated");
        CONFIG.PF2E.chatDamageButtonShieldToggle = !CONFIG.PF2E.chatDamageButtonShieldToggle;

        return;
    }

    const rollIndexStr = htmlClosest(btn, "[data-target-uuid]")?.dataset.targetRollIndex;
    const rollIndex = Number(rollIndexStr) || 0;

    applyDamageFromMessage.call(this, {
        message,
        multiplier: Number(multiplier),
        promptModifier: event.shiftKey,
        rollIndex,
        token: target,
        data,
    });
}

function toggleOffShieldBlock(messageId: string) {
    for (const id of ["chat", "chat-popout", "chat-notifications"]) {
        const buttons = document.querySelectorAll(
            `#${id} [data-message-id="${messageId}"] button[data-action$="shieldBlock"]`
        );

        for (const button of buttons) {
            button.classList.remove("shield-activated");
        }
    }

    CONFIG.PF2E.chatDamageButtonShieldToggle = false;
}

/**
 * slightly modified version of
 * https://github.com/foundryvtt/pf2e/blob/50b2b8e71a81c60f35fcb2e086e07c5e2706ca44/src/module/chat-message/helpers.ts#L88
 */
async function applyDamageFromMessage(
    this: TargetHelperTool,
    {
        message,
        multiplier = 1,
        addend = 0,
        promptModifier = false,
        rollIndex = 0,
        // ADDED BY MODULE
        token,
        data,
    }: ApplyDamageFromMessageParams
) {
    if (promptModifier)
        return shiftAdjustDamage.call(this, message, multiplier, rollIndex, token, data);

    // MODIFIED BY THE MODULE
    const tokens = [token];
    if (tokens.length === 0) {
        ui.notifications.error("PF2E.ErrorMessage.NoTokenSelected", { localize: true });
        return;
    }

    const shieldBlockRequest = CONFIG.PF2E.chatDamageButtonShieldToggle;
    const roll = message.rolls.at(rollIndex);
    if (!isInstanceOf(roll, "DamageRoll"))
        throw ErrorPF2e("Unexpected error retrieving damage roll");

    const damage =
        multiplier < 0 ? multiplier * roll.total + addend : roll.alter(multiplier, addend);

    // Get origin roll options and apply damage to a contextual clone: this may influence condition IWR, for example
    const messageRollOptions = [...(message.flags.pf2e.context?.options ?? [])];
    const originRollOptions = messageRollOptions
        .filter((o) => o.startsWith("self:"))
        .map((o) => o.replace(/^self/, "origin"));
    const messageItem = message.item;
    const effectRollOptions = messageItem?.isOfType("affliction", "condition", "effect")
        ? messageItem.getRollOptions("item")
        : [];

    for (const token of tokens) {
        if (!token.actor) continue;
        // Add roll option for ally/enemy status
        if (token.actor.alliance && message.actor) {
            const allyOrEnemy = token.actor.alliance === message.actor.alliance ? "ally" : "enemy";
            messageRollOptions.push(`origin:${allyOrEnemy}`);
        }

        // If no target was acquired during a roll, set roll options for it during damage application
        if (!messageRollOptions.some((o) => o.startsWith("target"))) {
            messageRollOptions.push(...token.actor.getSelfRollOptions("target"));
        }
        const domain = multiplier > 0 ? "damage-received" : "healing-received";
        const ephemeralEffects =
            multiplier > 0
                ? await extractEphemeralEffects({
                      affects: "target",
                      origin: message.actor,
                      target: token.actor,
                      item: message.item,
                      domains: [domain],
                      options: messageRollOptions,
                  })
                : [];
        const contextClone = token.actor.getContextualClone(originRollOptions, ephemeralEffects);
        const rollOptions = new Set([
            ...messageRollOptions.filter((o) => !/^(?:self|target)(?::|$)/.test(o)),
            ...effectRollOptions,
            ...originRollOptions,
            ...contextClone.getSelfRollOptions(),
        ]);

        await contextClone.applyDamage({
            damage,
            token,
            item: message.item,
            skipIWR: multiplier <= 0,
            rollOptions,
            shieldBlockRequest,
            outcome: message.flags.pf2e.context?.outcome,
        });
    }
    toggleOffShieldBlock(message.id);

    // ADDED BY MODULE
    onDamageApplied.call(this, message, data, token, rollIndex);
}

/**
 * slightly modified version of
 * https://github.com/foundryvtt/pf2e/blob/50b2b8e71a81c60f35fcb2e086e07c5e2706ca44/src/module/chat-message/helpers.ts#L173
 */
async function shiftAdjustDamage(
    this: TargetHelperTool,
    message: ChatMessagePF2e,
    multiplier: number,
    rollIndex: number,
    // ADDED BY MODULE
    token: TokenDocumentPF2e,
    data: TargetsData
): Promise<void> {
    const content = await foundry.applications.handlebars.renderTemplate(
        "systems/pf2e/templates/chat/damage/adjustment-dialog.hbs"
    );
    const AdjustmentDialog = class extends foundry.appv1.api.Dialog {
        override activateListeners($html: JQuery): void {
            super.activateListeners($html);
            $html[0].querySelector("input")?.focus();
        }
    };
    const isHealing = multiplier < 0;
    new AdjustmentDialog({
        title: game.i18n.localize(
            isHealing ? "PF2E.UI.shiftModifyHealingTitle" : "PF2E.UI.shiftModifyDamageTitle"
        ),
        content,
        buttons: {
            ok: {
                label: game.i18n.localize("PF2E.OK"),
                callback: async ($dialog: JQuery) => {
                    // In case of healing, multipler will have negative sign. The user will expect that positive
                    // modifier would increase healing value, while negative would decrease.
                    const adjustment =
                        (Number($dialog[0].querySelector("input")?.value) || 0) *
                        Math.sign(multiplier);
                    applyDamageFromMessage.call(this, {
                        message,
                        multiplier,
                        addend: adjustment,
                        promptModifier: false,
                        rollIndex,
                        token,
                        data,
                    });
                },
            },
            cancel: {
                label: "Cancel",
            },
        },
        default: "ok",
        close: () => {
            toggleOffShieldBlock(message.id);
        },
    }).render(true);
}

function onDamageApplied(
    this: TargetHelperTool,
    message: ChatMessagePF2e,
    data: TargetsData,
    target: TokenDocumentPF2e,
    rollIndex: number
) {
    const targetId = target.id;
    const splashIndex = data.splashIndex;

    const targetApplied: MessageApplied[number] = {
        [rollIndex]: true,
    };

    const applied: MessageApplied = {
        [targetId]: targetApplied,
    };

    if (splashIndex !== -1) {
        const regularIndex = data.regularIndex;

        if (rollIndex === splashIndex) {
            targetApplied[regularIndex] = true;
        } else {
            targetApplied[splashIndex] = true;

            for (const otherTarget of data.targets) {
                const otherId = otherTarget.id;
                if (otherId === targetId) continue;

                applied[otherId] = { [regularIndex]: true };
            }
        }
    }

    if (isMessageOwner(message)) {
        data.update({ applied });
        data.setFlag();
    } else {
        this.updateMessageEmitable.emit({
            message,
            applied,
        });
    }
}

function isPersistentDamageMessage(message: ChatMessagePF2e): boolean {
    return !!message.rolls[0].options.evaluatePersistent;
}

let HEALINGS_REGEX;
function isRegenMessage(message: ChatMessagePF2e) {
    HEALINGS_REGEX ??= (() => {
        const healings = [
            game.i18n.localize("PF2E.Encounter.Broadcast.FastHealing.fast-healing.ReceivedMessage"),
            game.i18n.localize("PF2E.Encounter.Broadcast.FastHealing.regeneration.ReceivedMessage"),
        ];
        return new RegExp(`^<div>(${healings.join("|")})</div>`);
    })();
    return HEALINGS_REGEX.test(message.flavor);
}

function isDamageMessage(message: ChatMessagePF2e): message is DamageMessage {
    return message.isDamageRoll;
}

interface ApplyDamageFromMessageParams {
    message: ChatMessagePF2e;
    multiplier?: number;
    addend?: number;
    promptModifier?: boolean;
    rollIndex?: number;
    // ADDED BY THE MODULE
    token: TokenDocumentPF2e;
    data: TargetsData;
}

type DamageMessage = ChatMessagePF2e & {
    rolls: Rolled<DamageRoll>[];
};

type MessageApplied = Record<string, toolbelt.targetHelper.MessageTargetApplied>;

export { isDamageMessage, prepareDamageMessage, renderDamageMessage };
