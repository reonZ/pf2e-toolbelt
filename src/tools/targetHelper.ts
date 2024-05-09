import {
    MODULE,
    R,
    RollNotePF2e,
    addListener,
    addListenerAll,
    applyDamageFromMessage,
    closest,
    createHTMLFromString,
    elementData,
    extractNotes,
    getActiveModule,
    isActiveGM,
    onClickShieldBlock,
    querySelector,
    querySelectorArray,
    refreshLatestMessages,
    saveTypes,
    toggleOffShieldBlock,
} from "pf2e-api";
import { DEGREE_OF_SUCCESS_STRINGS, DegreeOfSuccess } from "pf2e-api/src/success";
import { createTool } from "../tool";
import { CHATMESSAGE_GET_HTML } from "./shared/chatMessage";
import { TEXTEDITOR_ENRICH_HTML } from "./shared/textEditor";

const DAMAGE_MULTIPLIER = {
    "target-apply-healing": -1,
    "target-half-damage": 0.5,
    "target-apply-damage": 1,
    "target-double-damage": 2,
    "target-triple-damage": 3,
} as const;

const SAVES = {
    fortitude: { icon: "fa-solid fa-chess-rook", label: "PF2E.SavesFortitude" },
    reflex: { icon: "fa-solid fa-person-running", label: "PF2E.SavesReflex" },
    will: { icon: "fa-solid fa-brain", label: "PF2E.SavesWill" },
} as const;

const REROLL = {
    hero: {
        icon: "fa-solid fa-hospital-symbol",
        reroll: "PF2E.RerollMenu.HeroPoint",
        rerolled: "PF2E.RerollMenu.MessageHeroPoint",
    },
    new: {
        icon: "fa-solid fa-dice",
        reroll: "PF2E.RerollMenu.KeepNew",
        rerolled: "PF2E.RerollMenu.MessageKeep.new",
    },
    lower: {
        icon: "fa-solid fa-dice-one",
        reroll: "PF2E.RerollMenu.KeepLower",
        rerolled: "PF2E.RerollMenu.MessageKeep.lower",
    },
    higher: {
        icon: "fa-solid fa-dice-six",
        reroll: "PF2E.RerollMenu.KeepHigher",
        rerolled: "PF2E.RerollMenu.MessageKeep.higher",
    },
} as const;

const debouncedRefreshMessages = debounce(() => refreshLatestMessages(20), 1);

const {
    config,
    settings,
    hooks,
    wrappers,
    localize,
    socket,
    render,
    getFlag,
    setFlag,
    updateSourceFlag,
    setFlagProperty,
    deleteInMemory,
    getInMemory,
    setInMemory,
    waitDialog,
} = createTool({
    name: "targetHelper",
    settings: [
        {
            key: "enabled",
            type: Boolean,
            default: false,
            requiresReload: true,
        },
        {
            key: "addTargets",
            type: Boolean,
            default: true,
            scope: "client",
            onChange: (value) => {
                const addTargets = settings.enabled && value;

                if (addTargets) {
                    wrappers.enrichHTML.activate();
                    wrappers.messageGetHTML.activate();
                    document.body.addEventListener("dragstart", onDragStart, true);
                } else {
                    wrappers.enrichHTML.disable();
                    wrappers.messageGetHTML.disable();
                    document.body.removeEventListener("dragstart", onDragStart, true);
                }

                debouncedRefreshMessages();
            },
        },
        {
            key: "smallButtons",
            type: Boolean,
            default: true,
            scope: "client",
            onChange: () => {
                debouncedRefreshMessages();
            },
        },
    ],
    hooks: [
        {
            event: "preCreateChatMessage",
            listener: onPreCreateChatMessage,
        },
        {
            event: "getChatLogEntryContext",
            listener: onGetChatLogEntryContext,
        },
    ],
    wrappers: [
        {
            key: "messageGetHTML",
            path: CHATMESSAGE_GET_HTML,
            callback: chatMessageGetHTML,
        },
        {
            key: "enrichHTML",
            path: TEXTEDITOR_ENRICH_HTML,
            callback: textEditorEnrichHTML,
        },
    ],
    onSocket,
    init: (isGM) => {
        const enabled = settings.enabled;
        if (!enabled) return;

        socket.toggle(isGM);

        hooks.getChatLogEntryContext.activate();
        hooks.preCreateChatMessage.activate();

        if (settings.addTargets) {
            wrappers.enrichHTML.activate();
            wrappers.messageGetHTML.activate();
            document.body.addEventListener("dragstart", onDragStart, true);
        }
    },
} as const);

function onSocket(packet: SocketPacket, senderId: string) {
    if (!isActiveGM()) return;

    switch (packet.type) {
        case "update-applied": {
            const message = game.messages.get(packet.message);
            message?.update(packet.updates);
            break;
        }
        case "dice-so-nice": {
            roll3dDice(packet.roll, packet.target, true);
            break;
        }
        case "update-save": {
            const message = game.messages.get(packet.message);
            if (message) {
                setFlag(message, "saves", packet.updates);
            }
            break;
        }
    }
}

const INLINE_CHECK_REGEX = /(class="inline-check[\w0-9 -]*")/g;
function textEditorEnrichHTML(this: TextEditor, enriched: string) {
    return enriched.replace(INLINE_CHECK_REGEX, "$1 draggable='true'");
}

function isPersistentDamageMessage(message: ChatMessagePF2e) {
    return message.rolls[0].options.evaluatePersistent;
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

function isDamageMessage(
    message: ChatMessagePF2e
): message is Omit<ChatMessagePF2e, "rolls"> & { rolls: Rolled<DamageRoll>[] } {
    return message.isDamageRoll;
}

function isDamageSpell(spell: SpellPF2e | undefined) {
    return !!spell && spell.damageKinds.size > 0;
}

function getMessageTargets(message: ChatMessagePF2e) {
    return getFlag<string[]>(message, "targets") ?? [];
}

function getCurrentTargets(): string[] {
    return R.pipe(
        Array.from(game.user.targets as Set<TokenPF2e>),
        R.filter((target) => !!target.actor?.isOfType("creature", "hazard", "vehicle")),
        R.map((target) => target.document.uuid)
    );
}

function onGetChatLogEntryContext($html: JQuery, data: EntryContextOption[]) {
    const getMessageData = (html: JQuery) => {
        const messageId = html.data("messageId");
        const message = game.messages.get<ChatMessagePF2e>(messageId);
        if (!message) return;

        return {
            message,
            canRollSave: getInMemory<string[]>(message, "canRollSave"),
        };
    };

    data.unshift({
        icon: '<i class="fa-solid fa-dice-d20"></i>',
        name: localize.path("context.rollAll"),
        condition: (html) => {
            const data = getMessageData(html);
            return !!data?.canRollSave?.length;
        },
        callback: async (html) => {
            const { canRollSave, message } = getMessageData(html) ?? {};
            if (!message || !canRollSave?.length) return;

            const save = getSaveFlag(message);
            if (!save) return;

            const promisedTargets = await Promise.all(
                canRollSave.map((uuid) => fromUuid<CreatureTokenDocument>(uuid))
            );

            const targets = R.compact(promisedTargets);
            if (!targets.length) return;

            rollSaves(new MouseEvent("click"), message, save, targets);
        },
    });
}

function onPreCreateChatMessage(message: ChatMessagePF2e) {
    const isDamage = isDamageMessage(message) && !isPersistentDamageMessage(message);
    const item = message.item;
    const isSpell = item?.isOfType("spell");
    if (!isDamage && !isSpell) return;

    const token = message.token;
    const actor = token?.actor;
    const updates: Pairs<MessageFlag> = [];
    const save = isSpell ? item.system.defense?.save : undefined;

    if (!isDamage && isSpell && !save) return;

    if (!getMessageTargets(message).length) {
        if (isDamage && isRegenMessage(message)) {
            updates.push(["isRegen", true]);

            if (actor) {
                updates.push(["targets", [token.uuid]]);
            }
        } else {
            const targets = getCurrentTargets();
            if (targets.length) {
                updates.push(["targets", targets]);
            }
        }
    }

    if (isDamage && message.rolls.length === 2) {
        const splashRollIndex = message.rolls.findIndex((roll) => roll.options.splashOnly);
        const regularRollIndex = message.rolls.findIndex(
            (roll) =>
                !roll.options.splashOnly &&
                roll.options.damage?.modifiers?.some(
                    (modifier) =>
                        "damageCategory" in modifier && modifier.damageCategory === "splash"
                )
        );

        if (splashRollIndex !== -1 && regularRollIndex !== -1) {
            updates.push(["splashIndex", splashRollIndex]);
        }
    }

    if (isSpell && save) {
        const dc = item.spellcasting?.statistic?.dc.value;

        if (typeof dc === "number") {
            updates.push(["save", { ...save, dc, author: actor?.uuid }]);
        }
    }

    if (!updates.length) return;

    updateSourceFlag(message, Object.fromEntries(updates));
}

async function chatMessageGetHTML(this: ChatMessagePF2e, html: HTMLElement) {
    if (!this.isContentVisible) return;

    deleteInMemory(this, "canRollSave");
    deleteInMemory(this, "canApplyDamage");

    if (isDamageMessage(this)) {
        if (isPersistentDamageMessage(this)) return;
        await damageChatMessageGetHTML(this, html);
        return;
    }

    const item = this.item;
    if (!item || !item.isOfType("spell")) return;

    if (!isDamageSpell(item)) {
        await spellChatMessageGetHTML(this, html);
    } else {
        addListener(html, "[data-action='spell-damage']", () => {
            const messageId = this.id;
            const save = getFlag<MessageSaveFlag>(this, "save");
            if (!save) return;

            Hooks.once("preCreateChatMessage", (message) => {
                updateSourceFlag(message, "messageId", messageId);
                updateSourceFlag(message, "save", save);
            });
        });
    }
}

async function damageChatMessageGetHTML(message: ChatMessagePF2e, html: HTMLElement) {
    const msgContent = querySelector(html, ".message-content");
    const damageRows = querySelectorArray(msgContent, ".damage-application");
    const diceTotalElement = msgContent.querySelector(".dice-result .dice-total");
    if (!damageRows.length || !diceTotalElement) return;

    const data = await getMessageData(message);

    html.addEventListener("drop", onChatMessageDrop);

    const wrapper = createHTMLFromString("<div class='pf2e-toolbelt-target-buttons'></div>");

    diceTotalElement.append(wrapper);

    if (game.user.isGM || message.isAuthor) {
        const setTargetsBtn = createSetTargetsBtn(message);
        wrapper.append(setTargetsBtn);
    }

    if (data?.targets.length) {
        const toggleTooltip = localize("toggleDamageRows");
        const toggleTemplate = `<button class="pf2e-toolbelt-target-toggleDamageRows" 
            title="${toggleTooltip}">
                <i class="fa-solid fa-plus expand"></i>
                <i class="fa-solid fa-minus collapse"></i>
            </button>`;
        const toggleBtn = createHTMLFromString(toggleTemplate);

        toggleBtn.addEventListener("click", (event) => {
            event.stopPropagation();

            toggleBtn.classList.toggle("expanded");

            for (const damageRow of damageRows) {
                damageRow.classList.toggle("hidden");
            }
        });

        for (const damageRow of damageRows) {
            damageRow.classList.add("hidden");
        }

        wrapper.append(toggleBtn);
    } else {
        return;
    }

    const smallButtons = settings.smallButtons;
    const clonedDamageRows = damageRows.map((el) => {
        const clone = el.cloneNode(true) as HTMLElement;

        clone.classList.remove("damage-application");
        clone.classList.add("target-damage-application");

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

    const rowsWrapper = createHTMLFromString("<div class='pf2e-toolbelt-target-targetRows'></div>");

    for (const { template, isOwner, save, uuid, applied } of data.targets) {
        const hr = document.createElement("hr");
        const row = createHTMLFromString(template);

        rowsWrapper.append(hr);
        rowsWrapper.append(row);

        if (!isOwner) continue;

        const isBasic = isBasicSave(save);

        for (let i = 0; i < clonedDamageRows.length; i++) {
            const clonedDamageRow = clonedDamageRows[i];
            const clone = clonedDamageRow.cloneNode(true) as HTMLElement;

            clone.dataset.rollIndex = String(i);
            clone.dataset.targetUuid = uuid;

            clone.classList.toggle(
                "applied",
                !!applied[i] || (isBasic && save.result.success === "criticalSuccess")
            );

            if (isBasic) {
                clone.classList.add(save.result.success);
            }

            rowsWrapper.append(clone);
        }
    }

    msgContent.after(rowsWrapper);

    addHeaderListeners(message, rowsWrapper, data.save);

    addListenerAll(rowsWrapper, "[data-action^='target-']", (event, btn: HTMLButtonElement) =>
        onTargetButton(event, btn, message)
    );
}

let BASIC_SAVE_REGEX: RegExp;
function onDragStart(event: DragEvent) {
    const target = event.target;
    const dataTransfer = event.dataTransfer;

    if (
        !dataTransfer ||
        !(target instanceof HTMLAnchorElement) ||
        !target.classList.contains("inline-check")
    )
        return;

    const dataset = elementData(target);

    if (
        !dataset.pf2Dc ||
        !saveTypes.includes(dataset.pf2Check as SaveType) ||
        !["reflex", "will", "fortitude"].includes(dataset.pf2Check)
    ) {
        event.preventDefault();
        return;
    }

    event.stopPropagation();

    const data: SaveDragData = {
        dc: Number(dataset.pf2Dc),
        basic: false,
        statistic: dataset.pf2Check as SaveType,
        options: dataset.pf2RollOptions?.split(",").map((o) => o.trim()) ?? [],
        traits: dataset.pf2Traits?.split(",").map((o) => o.trim()) ?? [],
        type: `${MODULE.id}-check-roll`,
    };

    if (dataset.isBasic == null) {
        const label = target.querySelector("span.label")?.lastChild?.textContent?.trim();

        if (label) {
            if (!BASIC_SAVE_REGEX) {
                const saves = Object.values(CONFIG.PF2E.saves).map((x) => game.i18n.localize(x));
                const joined = game.i18n.format("PF2E.InlineCheck.BasicWithSave", {
                    save: `(${saves.join("|")})`,
                });
                BASIC_SAVE_REGEX = new RegExp(joined);
            }
            data.basic = BASIC_SAVE_REGEX.test(label);
        }
    }

    dataTransfer.setData("text/plain", JSON.stringify(data));
}

function onChatMessageDrop(event: DragEvent) {
    const target = (event.target as HTMLElement)?.closest<HTMLLIElement>("li.chat-message");
    if (!target) return;

    const data = TextEditor.getDragEventData<SaveDragData>(event);
    if (!data) return;

    const { type, dc, basic, options, statistic, traits } = data;
    if (type !== `${MODULE.id}-check-roll`) return;

    const messageId = target.dataset.messageId;
    const message = game.messages.get<ChatMessagePF2e>(messageId);
    if (!message || !message.isDamageRoll) return;

    if (!game.user.isGM && !message.isAuthor) {
        localize.warn("drop.unauth");
        return;
    }

    if (getFlag(message, "save")) {
        localize.warn("drop.already");
        return;
    }

    const updates = {};

    setFlagProperty(updates, "save", {
        basic,
        dc,
        statistic,
    });

    setFlagProperty(updates, "rollOptions", [...options, ...traits]);

    message.update(updates);

    localize.info("drop.added");
}

async function onTargetButton(event: MouseEvent, btn: HTMLButtonElement, message: ChatMessagePF2e) {
    const { rollIndex, targetUuid } = elementData(closest(btn, "[data-target-uuid]"));
    const target = await fromUuid<CreatureTokenDocument>(targetUuid);
    if (!target) return;

    const { action } = elementData<{ action: TargetButtonAction }>(btn);

    if (action === "target-shield-block") {
        const messageId = message.id;

        if (!btn.classList.contains("shield-activated")) {
            toggleOffShieldBlock(messageId);
        }

        requestAnimationFrame(() => {
            onClickShieldBlock(btn, closest(btn, ".chat-message"), target);
        });

        return;
    }

    applyDamageFromMessage({
        message,
        multiplier: DAMAGE_MULTIPLIER[action],
        addend: 0,
        promptModifier: event.shiftKey,
        rollIndex: Number(rollIndex),
        tokens: [target],
        onDamageApplied,
    });
}

export function onDamageApplied(
    message: ChatMessagePF2e,
    tokens: TokenDocumentPF2e[],
    rollIndex: number
) {
    const updates = {};
    const [token] = tokens;
    const tokenId = token.id;
    const splashIndex = getFlag<number>(message, "splashIndex");

    setFlagProperty(updates, "applied", tokenId, String(rollIndex), true);

    if (splashIndex !== undefined) {
        const regularIndex = splashIndex === 0 ? 1 : 0;

        if (rollIndex === splashIndex) {
            setFlagProperty(updates, "applied", tokenId, String(regularIndex), true);
        } else {
            setFlagProperty(updates, "applied", tokenId, String(splashIndex), true);

            const targetsFlag = getMessageTargets(message);
            for (const target of targetsFlag) {
                const targetId = target.split(".").at(-1) as string;
                if (targetId === tokenId) continue;

                setFlagProperty(updates, "applied", targetId, String(regularIndex), true);
            }
        }
    }

    if (game.user.isGM || message.isAuthor) {
        message.update(updates);
    } else {
        socket.emit({
            type: "update-applied",
            message: message.id,
            updates,
        });
    }
}

function isBasicSave(
    save: TargetSave | undefined
): save is Omit<TargetSave, "result"> & { result: TargetSaveResult } {
    return !!(save?.result && save.basic);
}

async function spellChatMessageGetHTML(message: ChatMessagePF2e, html: HTMLElement) {
    const data = await getMessageData(message);
    if (!data?.save) return;

    const msgContent = querySelector(html, ".message-content");
    const cardBtns = msgContent.querySelector<HTMLElement>(".card-buttons");
    const saveBtn = cardBtns?.querySelector<HTMLButtonElement>("[data-action='spell-save']");

    if (saveBtn && (game.user.isGM || message.isAuthor)) {
        const wrapper = createHTMLFromString("<div class='pf2e-toolbelt-target-wrapper'></div>");
        const setTargetsBtn = createSetTargetsBtn(message);

        wrapper.append(setTargetsBtn, saveBtn);
        cardBtns!.prepend(wrapper);
    }

    const { targets, save } = data;
    if (!targets.length) return;

    const rowsWrapper = createHTMLFromString("<div class='pf2e-toolbelt-target-targetRows'></div>");

    for (const { template } of targets) {
        const hr = document.createElement("hr");
        const row = createHTMLFromString(template);

        rowsWrapper.append(hr);
        rowsWrapper.append(row);
    }

    msgContent.after(rowsWrapper);

    addHeaderListeners(message, rowsWrapper, save);
}

function createSetTargetsBtn(message: ChatMessagePF2e) {
    const tooltip = localize("setTargets");
    const template = `<button class="pf2e-toolbelt-target-setTargets" data-action="set-targets"
        title="${tooltip}">
        <i class="fa-solid fa-bullseye-arrow"></i>
    </button>`;
    const btn = createHTMLFromString(template);

    btn.addEventListener("click", (event) => onSetTargets(event, message));
    return btn;
}

async function addHeaderListeners(
    message: ChatMessagePF2e,
    html: HTMLElement,
    save?: MessageSaveDataWithTooltip
) {
    const targetElements = html.querySelectorAll("[data-target-uuid]");

    for (const targetElement of targetElements) {
        const { targetUuid } = elementData(targetElement);
        const target = await fromUuid<CreatureTokenDocument>(targetUuid);
        if (!target) continue;

        addListener(targetElement, "[data-action='ping-target']", () => {
            canvas.ping(target.center);
        });

        addListener(targetElement, "[data-action='open-target-sheet']", () => {
            target.actor?.sheet.render(true);
        });

        if (save) {
            addListener(targetElement, "[data-action='roll-save']", (event) => {
                rollSaves(event, message, save, [target]);
            });

            addListener(targetElement, "[data-action='reroll-save']", (event) => {
                rerollSave(event, message, save, target);
            });
        }
    }
}

async function rollSaves(
    event: MouseEvent,
    message: ChatMessagePF2e,
    { dc, statistic }: MessageSaveData,
    targets: CreatureTokenDocument[]
) {
    const user = game.user as UserPF2e;
    const updates: Record<string, MessageTargetSave> = {};

    await Promise.all(
        targets.map((target) => {
            const actor = target.actor;
            if (!actor) return;

            const save = actor.saves[statistic];
            if (!save) return;

            const item = message.item;
            const rollOptions = getFlag<string[]>(message, "rollOptions");
            const skipDefault = !user.settings.showCheckDialogs;
            const skipDialog = targets.length > 1 || (event.shiftKey ? !skipDefault : skipDefault);

            return new Promise<void>((resolve) => {
                save.check.roll({
                    event,
                    dc: { value: dc },
                    item,
                    origin: actor,
                    skipDialog,
                    extraRollOptions: rollOptions,
                    createMessage: false,
                    callback: async (roll, success, msg) => {
                        await roll3dDice(roll, target);

                        const context = msg.getFlag<CheckContextChatFlag>("pf2e", "context")!;
                        const modifiers = msg.getFlag<RawModifier[]>("pf2e", "modifiers")!;
                        const data: MessageTargetSave = {
                            whispers: msg.whisper.filter((userId) => game.users.get(userId)?.isGM),
                            value: roll.total,
                            die: (roll.terms[0] as NumericTerm).total,
                            success: success!,
                            roll: JSON.stringify(roll.toJSON()),
                            dosAdjustments: context.dosAdjustments,
                            unadjustedOutcome: context.unadjustedOutcome,
                            notes: context.notes,
                            modifiers: modifiers
                                .filter((modifier) => modifier.enabled)
                                .map(({ label, modifier }) => ({ label, modifier })),
                        };

                        updates[target.id] = data;

                        resolve();
                    },
                });
            });
        })
    );

    if (user.isGM || message.isAuthor) {
        setFlag(message, "saves", updates);
    } else {
        socket.emit({
            type: "update-save",
            message: message.id,
            updates,
        });
    }
}

async function rerollSave(
    event: MouseEvent,
    message: ChatMessagePF2e,
    { dc, statistic }: MessageSaveData,
    target: CreatureTokenDocument
) {
    const actor = target?.actor;
    if (!actor) return;

    const flag = getFlag<MessageTargetSave>(message, `saves.${target.id}`);
    if (!flag?.roll || flag.rerolled) return;

    const content = R.pipe(
        Object.entries(REROLL),
        actor.isOfType("character") && actor.heroPoints.value > 0
            ? R.identity
            : R.filter(([type]) => type !== "hero"),
        R.map.indexed(([type, { icon, reroll }], i) => {
            const label = game.i18n.localize(reroll);
            const checked = i === 0 ? "checked" : "";

            return `<label>
                <input type="radio" name="reroll" value="${type}" ${checked}>
                <i class="${icon}"></i> ${label}
            </label>`;
        }),
        R.compact,
        R.join("")
    );

    const html = await waitDialog("reroll", {
        title: `${target.name} - ${localize("reroll.title")}`,
        content,
        yes: "fa-solid fa-rotate rotate",
    });

    if (!html) return;

    const rerollElement = querySelector<HTMLInputElement>(html, "[name='reroll']:checked");
    const reroll = rerollElement.value as keyof typeof REROLL;
    const isHeroReroll = reroll === "hero";
    const keep = isHeroReroll ? "new" : reroll;

    if (isHeroReroll) {
        const { value, max } = (actor as CharacterPF2e).heroPoints;

        if (value < 1) {
            localize.warn("reroll.noPoints");
            return;
        }

        await actor.update({
            "system.resources.heroPoints.value": Math.clamped(value - 1, 0, max),
        });
    }

    const oldRoll = Roll.fromJSON<Rolled<CheckRoll>>(flag.roll);
    const unevaluatedNewRoll = oldRoll.clone() as CheckRoll;
    unevaluatedNewRoll.options.isReroll = true;

    Hooks.callAll(
        "pf2e.preReroll",
        Roll.fromJSON(flag.roll),
        unevaluatedNewRoll,
        isHeroReroll,
        keep
    );

    const newRoll = await unevaluatedNewRoll.evaluate({ async: true });
    await roll3dDice(newRoll, target);

    Hooks.callAll("pf2e.reroll", Roll.fromJSON(flag.roll), newRoll, isHeroReroll, keep);

    const keptRoll =
        (keep === "higher" && oldRoll.total > newRoll.total) ||
        (keep === "lower" && oldRoll.total < newRoll.total)
            ? oldRoll
            : newRoll;

    if (keptRoll === newRoll) {
        const success = new DegreeOfSuccess(newRoll, dc, flag.dosAdjustments);
        keptRoll.options.degreeOfSuccess = success.value;
    }

    const domains = actor.saves[statistic].domains;
    const rollOptions = getFlag<string[]>(message, "rollOptions") ?? [];
    const outcome = DEGREE_OF_SUCCESS_STRINGS[keptRoll.degreeOfSuccess!];
    const actorNotes = [...extractNotes(actor.synthetics.rollNotes, domains)];
    const notes =
        actorNotes
            ?.map((n) => (n instanceof RollNotePF2e ? n : new RollNotePF2e(n)))
            .filter((note) => {
                if (
                    !note.predicate.test([
                        ...rollOptions,
                        ...(note.rule?.item.getRollOptions("parent") ?? []),
                    ])
                ) {
                    return false;
                }
                if (note.outcome.length === 0) return true;
                return !!(outcome && note.outcome.includes(outcome));
            }) ?? [];

    const data: MessageTargetSave = {
        whispers: flag.whispers,
        value: keptRoll.total,
        die: (keptRoll.terms[0] as NumericTerm).total,
        success: outcome,
        roll: JSON.stringify(keptRoll.toJSON()),
        dosAdjustments: deepClone(flag.dosAdjustments),
        modifiers: deepClone(flag.modifiers),
        notes: notes.map((note) => note.toObject()),
        rerolled: reroll,
    };

    if (keptRoll.options.keeleyAdd10) {
        data.modifiers.push({
            label: localize("target.chat.save.reroll.keeley"),
            modifier: 10,
        });
    }

    if (game.user.isGM || message.isAuthor) {
        setFlag(message, "saves", target.id, data);
    } else {
        socket.emit({
            type: "update-save",
            message: message.id,
            updates: { [target.id]: data },
        });
    }
}

async function roll3dDice(
    roll: Rolled<CheckRoll> | RollJSON,
    target: CreatureTokenDocument | string | undefined,
    self = false
) {
    if (!game.dice3d) return;

    const user = game.user;
    const synchronize = !self && game.pf2e.settings.metagame.breakdowns;

    roll = roll instanceof Roll ? roll : Roll.fromData<Rolled<CheckRoll>>(roll);
    target = typeof target === "string" ? await fromUuid<CreatureTokenDocument>(target) : target;

    if (!self && !synchronize) {
        socket.emit({
            type: "dice-so-nice",
            roll: roll.toJSON(),
            target: target?.uuid,
        });
    } else if (self) {
        if (!user.isGM && !target?.playersCanSeeName) {
            roll.ghost = true;
        }
    }

    return game.dice3d.showForRoll(roll, user, synchronize);
}

async function onSetTargets(event: MouseEvent, message: ChatMessagePF2e) {
    event.stopPropagation();

    const targets = getCurrentTargets();

    await setFlag(message, "targets", targets);
    requestAnimationFrame(() => ui.chat.scrollBottom({ popout: true, waitImages: true }));
}

async function getMessageData(message: ChatMessagePF2e) {
    const targetsFlag = getMessageTargets(message);
    const save = getSaveFlag(message) as MessageSaveDataWithTooltip | undefined;
    if (!targetsFlag.length && !save) return;

    const user = game.user;
    const isGM = user.isGM;
    const userId = user.id;
    const author = save?.author ? await fromUuid<ActorPF2e>(save.author) : undefined;
    const showDC = isGM || game.pf2e.settings.metagame.dcs || author?.hasPlayerOwner;
    const showBreakdowns = isGM || game.pf2e.settings.metagame.breakdowns;
    const showResults = isGM || game.pf2e.settings.metagame.results;

    if (save) {
        const saveLabel = game.i18n.format("PF2E.SavingThrowWithName", {
            saveName: game.i18n.localize(save.label),
        });
        const saveDC = showDC ? localize("tooltip.dcWithValue", { dc: save.dc }) : "";
        save.tooltipLabel = `${saveLabel} ${saveDC}`;
        save.tooltip = await render("tooltip", {
            check: save.tooltipLabel,
        });
    }

    const canRollSave: string[] = [];
    const canApplyDamage: string[] = [];

    const allTargets = await Promise.all(
        targetsFlag.map(async (tokenUUID) => {
            const target = await fromUuid<CreatureTokenDocument>(tokenUUID);
            if (!target) return;

            const targetId = target.id;
            const targetActor = target.actor;
            if (!targetActor) return;

            const isHidden = target.hidden || targetActor.hasCondition("unnoticed", "undetected");
            if (!isGM && isHidden) return;

            const isOwner = targetActor.isOwner;
            const hasPlayerOwner = targetActor.hasPlayerOwner;
            const isFriendly = isOwner || hasPlayerOwner;
            const hasSave = save && !!targetActor.saves?.[save.statistic];
            const saveFlag = getFlag<MessageTargetSave>(message, `saves.${targetId}`);

            if (hasSave && !hasPlayerOwner && !saveFlag) {
                canRollSave.push(tokenUUID);
            }

            const targetSave = await (async () => {
                if (!hasSave || !saveFlag) return;

                const rerolled = saveFlag.rerolled;
                const canReroll = hasSave && isOwner && !rerolled;
                const offset = saveFlag.value - save.dc;
                const adjustment =
                    (isFriendly || showBreakdowns) &&
                    saveFlag.unadjustedOutcome &&
                    saveFlag.success !== saveFlag.unadjustedOutcome
                        ? saveFlag.dosAdjustments?.[saveFlag.unadjustedOutcome]?.label
                        : undefined;
                const isPrivate = !hasPlayerOwner && saveFlag.whispers.length;
                const canSeeResult = isGM || !isPrivate;
                const notes = saveFlag.notes.map((note) => new RollNotePF2e(note));
                const notesList = RollNotePF2e.notesToHTML(notes);
                notesList?.classList.add("pf2e-toolbelt-target-notes");

                let result = "";

                if (canSeeResult) {
                    if (isFriendly || showBreakdowns) {
                        result += `(<i class="fa-solid fa-dice-d20"></i> ${saveFlag.die}) `;
                    }

                    if (isFriendly || showResults) {
                        result += localize(
                            `tooltip.result.${showDC ? "withOffset" : "withoutOffset"}`,
                            {
                                success: game.i18n.localize(
                                    `PF2E.Check.Result.Degree.Check.${saveFlag.success}`
                                ),
                                offset: offset >= 0 ? `+${offset}` : offset,
                            }
                        );
                    }
                }

                return {
                    ...saveFlag,
                    notes: notesList?.outerHTML,
                    canReroll,
                    isPrivate,
                    canSeeResult,
                    tooltip: await render("tooltip", {
                        check: save.tooltipLabel,
                        result: result ? localize("tooltip.result.format", { result }) : undefined,
                        modifiers: isFriendly || showBreakdowns ? saveFlag.modifiers : [],
                        adjustment,
                        canReroll,
                        rerolled: rerolled ? REROLL[rerolled] : undefined,
                    }),
                };
            })();

            const templateSave: TargetSave | undefined = save && {
                ...save,
                result: targetSave,
            };

            const anonymous = getActiveModule<AnonymousModule>("anonymous");
            const canSeeName = isGM
                ? true
                : anonymous?.api.playersSeeName(target.actor) ??
                  (!game.pf2e.settings.tokens.nameVisibility || target.playersCanSeeName);
            const name = canSeeName
                ? target.name
                : anonymous?.api.getName(target.actor) ?? localize("unnamed");

            const applied = getFlag<boolean[]>(message, `applied.${targetId}`) ?? [];

            return {
                isOwner,
                canSeeName,
                hasPlayerOwner,
                uuid: tokenUUID,
                target,
                applied,
                save: templateSave,
                template: await render("header", {
                    name,
                    isGM,
                    isOwner,
                    hasPlayerOwner,
                    isHidden,
                    uuid: tokenUUID,
                    showSuccess: isFriendly || showResults,
                    save: hasSave && templateSave,
                    canReroll: targetSave?.canReroll,
                    isPrivate: isGM && targetSave?.isPrivate,
                    canSeeResult: targetSave?.canSeeResult,
                    rerolled: targetSave?.rerolled ? REROLL[targetSave.rerolled] : undefined,
                }),
            };
        })
    );

    setInMemory(message, "canRollSave", canRollSave);
    setInMemory(message, "canApplyDamage", canApplyDamage);

    const targets = R.compact(allTargets);

    if (isGM) {
        targets.sort((a, b) => Number(a.hasPlayerOwner) - Number(b.hasPlayerOwner));
    } else {
        targets.sort((a, b) =>
            !a.isOwner && !b.isOwner
                ? Number(b.hasPlayerOwner) - Number(a.hasPlayerOwner)
                : Number(b.isOwner) - Number(a.isOwner)
        );
    }

    return { targets, save, isRegen: getFlag(message, "isRegen") };
}

function getSaveFlag(message: ChatMessagePF2e): MessageSaveData | undefined {
    const flag = getFlag<MessageSaveFlag>(message, "save");
    if (!flag) return;

    return {
        ...flag,
        ...SAVES[flag.statistic],
    };
}

type TargetButtonAction =
    | "target-apply-healing"
    | "target-half-damage"
    | "target-apply-damage"
    | "target-double-damage"
    | "target-shield-block"
    | "target-triple-damage";

type MessageSaveDataWithTooltip = MessageSaveData & {
    tooltipLabel: string;
    tooltip: string;
};

type MessageSaveData = MessageSaveFlag & {
    icon: string;
    label: string;
};

type MessageSaveFlag = {
    statistic: SaveType;
    basic: boolean;
    dc: number;
    author?: string;
};

type MessageTargetSave = {
    whispers: string[];
    value: number;
    die: number;
    success: DegreeOfSuccessString;
    roll: string;
    notes: RollNoteSource[];
    dosAdjustments: DegreeAdjustmentsRecord | undefined;
    unadjustedOutcome?: DegreeOfSuccessString | null;
    modifiers: { label: string; modifier: number }[];
    rerolled?: keyof typeof REROLL;
};

type MessageFlag = {
    targets?: string[];
    save?: MessageSaveFlag;
    saves?: Record<string, MessageTargetSave>;
    splashIndex?: number;
    isRegen?: boolean;
    applied?: Record<string, boolean[]>;
};

type TargetSaveResult = Omit<MessageTargetSave, "notes"> & {
    canReroll: boolean;
    tooltip: string;
    notes: string | undefined;
};

type TargetSave = MessageSaveDataWithTooltip & {
    result: TargetSaveResult | undefined;
};

type SocketPacket =
    | {
          type: "update-applied";
          message: string;
          updates: Record<string, any>;
      }
    | {
          type: "dice-so-nice";
          roll: RollJSON;
          target: string | undefined;
      }
    | {
          type: "update-save";
          message: string;
          updates: Record<string, MessageTargetSave>;
      };

type CreatureTokenDocument = TokenDocumentPF2e<CreaturePF2e>;

type SaveDragData = {
    basic: boolean;
    dc: number;
    statistic: SaveType;
    type: `${typeof MODULE.id}-check-roll`;
    options: string[];
    traits: string[];
};

export {
    getMessageTargets,
    setFlagProperty as setTargetHelperFlagProperty,
    config as targetHelperTool,
};
