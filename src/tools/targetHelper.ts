import {
    DEGREE_OF_SUCCESS_STRINGS,
    DegreeOfSuccess,
    MODULE,
    R,
    RollNotePF2e,
    SAVE_TYPES,
    actorItems,
    addListener,
    addListenerAll,
    applyDamageFromMessage,
    canObserveActor,
    createHTMLElement,
    elementDataset,
    extractNotes,
    firstElementWithText,
    getActiveModule,
    getChoiceSetSelection,
    getItemChatTraits,
    htmlClosest,
    htmlQuery,
    htmlQueryAll,
    isInstanceOf,
    onClickShieldBlock,
    parseInlineParams,
    refreshLatestMessages,
    removeIndexFromArray,
    setControlled,
    splitListString,
    toggleOffShieldBlock,
    updateFlag,
    userIsActiveGM,
} from "foundry-pf2e";
import { createTool } from "../tool";
import { CHATMESSAGE_GET_HTML } from "./shared/chatMessage";
import { TEXTEDITOR_ENRICH_HTML } from "./shared/textEditor";

const REPOST_CHECK_MESSAGE_REGEX =
    /^(?:<span data-visibility="[\w]+">.+?<\/span> ?)?(<a class="inline-check.+?<\/a>)$/;
const PROMPT_CHECK_MESSAGE_REGEX = /^(?:<p>)?@Check\[([^\]]+)\](?:{([^}]+)})?(?:<\/p>)?$/;

const THIRD_PATH_TO_PERFECTION = "Compendium.pf2e.classfeatures.Item.haoTkr2U5k7kaAKN";

const LEGENDARY_SAVES = [
    "Compendium.pf2e.classfeatures.Item.TuL0UfqH14MtqYVh", // Greater Juggernaut
    "Compendium.pf2e.classfeatures.Item.XFcCeBYqeXgfiA84", // Greater Dogged Will
    "Compendium.pf2e.classfeatures.Item.rpLPCkTXCZlQ51SR", // Greater Natural Reflexes
    "Compendium.pf2e.classfeatures.Item.BTpL6XvMk4jvVYYJ", // Greater Rogue Reflexes
    "Compendium.pf2e.classfeatures.Item.syEkISIi0F9946zo", // Assured Evasion
    "Compendium.pf2e.classfeatures.Item.Kj59CmXnMJDKXKWx", // Greater Mysterious Resolve
    "Compendium.pf2e.classfeatures.Item.mRobjNNsABQdUUZq", // Greater Performer's Heart
    "Compendium.pf2e.classfeatures.Item.Hw6Ji7Fgx0XkVkac", // Fortress of Will
    "Compendium.pf2e.classfeatures.Item.5LOARurr4qWkfS9K", // Greater Resolve
    "Compendium.pf2e.classfeatures.Item.i3qjbhL7uukg9I80", // Greater Kinetic Durability
];

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

const debouncedRefreshMessages = foundry.utils.debounce(() => refreshLatestMessages(20), 1);

const {
    config,
    settings,
    hook,
    wrappers,
    localize,
    socket,
    render,
    getFlag,
    setFlag,
    updateSourceFlag,
    setFlagProperty,
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

        socket.toggle(isGM || !!getActiveModule("dice-so-nice"));

        hook.activate();

        if (settings.addTargets) {
            wrappers.enrichHTML.activate();
            wrappers.messageGetHTML.activate();
            document.body.addEventListener("dragstart", onDragStart, true);
        }
    },
} as const);

function onSocket(packet: SocketPacket, senderId: string) {
    switch (packet.type) {
        case "update-applied": {
            if (!userIsActiveGM()) return;
            const message = game.messages.get(packet.message);
            message?.update(packet.updates);
            break;
        }
        case "dice-so-nice": {
            roll3dDice(packet.roll, packet.target, packet.private, true);
            break;
        }
        case "update-save": {
            if (!userIsActiveGM()) return;
            const message = game.messages.get(packet.message);
            if (message) {
                setFlag(message, "saves", packet.updates);
            }
            break;
        }
    }
}

const INLINE_CHECK_REGEX = /(data-pf2-check="[\w]+")/g;
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
): message is ChatMessagePF2e & { rolls: Rolled<DamageRoll>[] } {
    return message.isDamageRoll;
}

function isActionMessage(message: ChatMessagePF2e) {
    const type = message.getFlag<string>("pf2e", "origin.type");
    return !!type && ["feat", "action"].includes(type);
}

function isDamageSpell(spell: SpellPF2e | undefined) {
    return !!spell && spell.damageKinds.size > 0;
}

function getMessageFlag<TFlag extends keyof MessageFlag>(message: ChatMessagePF2e, flag: TFlag) {
    return getFlag<MessageFlag[TFlag]>(message, flag);
}

function getMessageTargets(message: ChatMessagePF2e) {
    return getMessageFlag(message, "targets") ?? [];
}

function getCurrentTargets(): string[] {
    return R.pipe(
        Array.from(game.user.targets),
        R.filter((target) => !!target.actor?.isOfType("creature", "hazard", "vehicle")),
        R.map((target) => target.document.uuid)
    );
}

function getCheckLinkData(message: ChatMessagePF2e): SaveLinkData | null {
    const promptMatch = message.content.match(PROMPT_CHECK_MESSAGE_REGEX);
    if (promptMatch) {
        const [_match, paramString, inlineLabel] = promptMatch;
        const rawParams = parseInlineParams(paramString, { first: "type" });
        if (!rawParams) return null;

        const statistic = rawParams.type?.trim();
        const dc = Number(rawParams.dc);
        if (!SAVE_TYPES.includes(statistic) || isNaN(dc)) return null;

        const basic = "basic" in rawParams;
        const options = [
            ...(basic ? ["damaging-effect"] : []),
            ...splitListString(rawParams.options ?? ""),
        ]
            .filter(R.isTruthy)
            .sort();

        return {
            dc,
            basic,
            options,
            statistic,
            traits: splitListString(rawParams.traits ?? ""),
        } satisfies SaveLinkData;
    }

    const repostMatch = message.content.match(REPOST_CHECK_MESSAGE_REGEX);
    if (repostMatch) {
        const tmp = createHTMLElement("div", { innerHTML: repostMatch[1] });
        const link = tmp.firstChild;

        return isValidCheckLink(link) ? getSaveLinkData(link) : null;
    }

    return null;
}

function onPreCreateChatMessage(message: ChatMessagePF2e) {
    const isDamage = isDamageMessage(message) && !isPersistentDamageMessage(message);
    const checkLinkData = !isDamage ? getCheckLinkData(message) : null;
    const isAction = !isDamage && !checkLinkData && isActionMessage(message);
    const item = message.item;
    const isSpell = item?.isOfType("spell") && !message.isCheckRoll;
    if (!isDamage && !isSpell && !isAction && !checkLinkData) return;

    const token = message.token;
    const actor = token?.actor;
    const spellSaveData = isSpell ? item.system.defense?.save : undefined;

    if (!isDamage && isSpell && !spellSaveData) return;

    const type: TargetMessageType = isDamage
        ? "damage"
        : isSpell
        ? isDamageSpell(item)
            ? "spell-damage"
            : "spell-save"
        : checkLinkData
        ? "check"
        : "action";

    const updates: Pairs<MessageFlag> = [["type", type]];

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
        const splashRollIndex = message.rolls.findIndex(
            (roll: DamageRoll) => roll.options.splashOnly
        );
        const regularRollIndex = message.rolls.findIndex(
            (roll: DamageRoll) =>
                !roll.options.splashOnly &&
                roll.options.damage?.modifiers?.some(
                    (modifier) =>
                        ("category" in modifier && modifier.category === "splash") ||
                        ("damageCategory" in modifier && modifier.damageCategory === "splash")
                )
        );

        if (splashRollIndex !== -1 && regularRollIndex !== -1) {
            updates.push(["splashIndex", splashRollIndex]);
        }
    }

    if (isSpell && spellSaveData) {
        const dc = item.spellcasting?.statistic?.dc.value;

        if (typeof dc === "number") {
            updates.push(["save", { ...spellSaveData, dc, author: actor?.uuid }]);
        }
    }

    if (checkLinkData) {
        const { basic, dc, options, statistic, traits } = checkLinkData;

        updates.push(["save", { basic, dc, statistic, author: actor?.uuid }]);
        updates.push(["rollOptions", [...options, ...traits]]);
    }

    updateSourceFlag(message, Object.fromEntries(updates));
}

async function chatMessageGetHTML(this: ChatMessagePF2e, html: HTMLElement) {
    if (!this.isContentVisible) return;

    const type = getMessageFlag(this, "type");
    if (!type) return;

    switch (type) {
        case "action": {
            await actionChatMessageGetHtml(this, html);
            break;
        }

        case "check": {
            await checkMessageGetHTML(this, html);
            break;
        }

        case "damage": {
            await damageChatMessageGetHTML(this, html);
            break;
        }

        case "spell-damage": {
            addListener(html, "[data-action='spell-damage']", () => {
                const messageId = this.id;
                const save = getMessageFlag(this, "save");
                if (!save) return;

                Hooks.once("preCreateChatMessage", (message: ChatMessage) => {
                    updateSourceFlag(message, "messageId", messageId);
                    updateSourceFlag(message, "save", save);
                });
            });
            break;
        }

        case "spell-save": {
            await spellChatMessageGetHTML(this, html);
            break;
        }
    }
}

async function actionChatMessageGetHtml(message: ChatMessagePF2e, html: HTMLElement) {
    const msgContent = htmlQuery(html, ".message-content");
    const chatCard = htmlQuery(msgContent, ".chat-card");
    if (!msgContent || !chatCard) return;

    html.addEventListener("drop", onChatMessageDrop);

    const data = await getMessageData(message, true);
    if (!data) return;

    const isGM = game.user.isGM;
    const isAuthor = message.isAuthor;

    if (!data.targets.length && !isGM && !isAuthor) return;

    let footer = htmlQuery(chatCard, "footer");
    if (!footer) {
        const actionLabel = game.i18n.localize("TYPES.Item.action");

        footer = createHTMLElement("footer", {
            innerHTML: `<span>${actionLabel}</span>`,
        });

        chatCard.append(footer);
    }

    if (isGM || isAuthor) {
        const setTargetsBtn = createSetTargetsBtn(message, true);
        footer.append(setTargetsBtn);
    }

    const rollSavesBtn = createRollSavesBtn(message, data, true);
    if (rollSavesBtn) {
        footer.append(rollSavesBtn);
    }

    addSaveHeaders(data, message, msgContent);
}

async function checkMessageGetHTML(message: ChatMessagePF2e, html: HTMLElement) {
    const msgContent = htmlQuery(html, ".message-content");
    const link = htmlQuery(msgContent, "a");
    if (!msgContent || !link) return;

    const data = await getMessageData(message);
    if (!dataHasSave(data)) return;

    const isOwner = game.user.isGM || message.isAuthor;
    const canRollSaves = userCanRollSaves(data);
    const canObserve = canObserveActor(message.actor, true);
    const item = canObserve ? message.item : null;
    const flavor = htmlQuery(html, ".message-header .flavor-text");
    const saveLabel = firstElementWithText(msgContent.lastElementChild);
    const label =
        firstElementWithText(flavor) ?? firstElementWithText(msgContent.firstElementChild);

    flavor?.remove();

    link.classList.add("hidden");

    msgContent.innerHTML = await render("check-card", {
        item,
        isOwner,
        canRollSaves,
        speaker: message.speaker,
        label: label?.outerHTML || "",
        save: saveLabel?.outerHTML || "",
        traits: item ? getItemChatTraits(item) : undefined,
    });

    msgContent.prepend(link);

    const setTargetsBtn = htmlQuery(msgContent, "[data-action='set-targets']");
    if (setTargetsBtn) {
        addSetTargetsListener(setTargetsBtn, message);
    }

    if (canRollSaves) {
        const rollSavesBtn = htmlQuery(msgContent, "[data-action='roll-saves']");
        if (rollSavesBtn) {
            addRollSavesListener(rollSavesBtn, message, data);
        }
    }

    addSaveHeaders(data, message, msgContent);

    const fakeBtn = htmlQuery<HTMLButtonElement>(msgContent, "[data-action='roll-fake-check']");
    if (fakeBtn) {
        linkSaveBtns(link, fakeBtn, message, data);
    }
}

function createDamageToggleBtn(damageRows: HTMLElement[]) {
    const toggleBtn = createHTMLElement("button", {
        classes: ["pf2e-toolbelt-target-toggleDamageRows"],
        innerHTML: `<i class="fa-solid fa-plus expand"></i><i class="fa-solid fa-minus collapse"></i>`,
    });

    toggleBtn.title = localize("toggleDamageRows");
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

    return toggleBtn;
}

async function damageChatMessageGetHTML(message: ChatMessagePF2e, html: HTMLElement) {
    const msgContent = htmlQuery(html, ".message-content");
    if (!msgContent) return;

    const damageRows = htmlQueryAll(msgContent, ".damage-application");
    const diceTotalElement = msgContent.querySelectorAll(".dice-result .dice-total");
    if (!damageRows.length || !diceTotalElement.length) return;

    const data = await getMessageData(message);
    const wrapper = createHTMLElement("div", { classes: ["pf2e-toolbelt-target-buttons"] });
    const splashWrapper = createHTMLElement("div", { classes: ["pf2e-toolbelt-target-buttons"] });

    html.addEventListener("drop", onChatMessageDrop);

    const splashIndex = data?.splashIndex ?? -1;
    const hasSplashTargets = data?.hasSplashTargets;
    const hasSplashDamage = splashIndex > -1;
    const hasTargets = data?.hasTargets;

    if (hasTargets) {
        const rows = removeIndexFromArray(damageRows, splashIndex);
        const toggleBtn = createDamageToggleBtn(rows);

        wrapper.append(toggleBtn);
    }

    if (hasSplashDamage && (hasTargets || hasSplashTargets)) {
        const row = damageRows[splashIndex];
        const toggleBtn = createDamageToggleBtn([row]);

        splashWrapper.append(toggleBtn);
    }

    const isGM = game.user.isGM;

    if (isGM || message.isAuthor) {
        const setTargetsBtn = createSetTargetsBtn(message);

        wrapper.append(setTargetsBtn);

        if (hasSplashDamage) {
            const setSplashTargetBtn = createHTMLElement("button", {
                classes: ["pf2e-toolbelt-target-setTargets", "splash-targets"],
                dataset: { action: "set-splash-targets" },
                innerHTML: "<i class='fa-solid fa-burst'></i>",
            });

            setSplashTargetBtn.title = localize("setSplashTargets");

            diceTotalElement[splashIndex]?.append(splashWrapper);

            splashWrapper.append(setSplashTargetBtn);
            addSetTargetsListener(setSplashTargetBtn, message, "splashTargets");
        }
    }

    const rollSavesBtn = createRollSavesBtn(message, data);
    if (rollSavesBtn) {
        wrapper.append(rollSavesBtn);
    }

    diceTotalElement[0].append(wrapper);

    if (hasSplashDamage) {
        diceTotalElement[splashIndex].append(splashWrapper);
    }

    if (!hasTargets && !hasSplashTargets) return;

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

    const rowsWrapper = createHTMLElement("div", {
        classes: ["pf2e-toolbelt-target-targetRows", "pf2e-toolbelt-target-damage"],
    });

    for (const { template, isOwner, save, uuid, applied, target, isSplashTarget } of data.targets) {
        const hrElement = createHTMLElement("hr");
        const rowElement = createHTMLElement("div", {
            dataset: { targetUuid: uuid },
            classes: ["target-header"],
            innerHTML: template,
        });

        rowsWrapper.append(hrElement);
        rowsWrapper.append(rowElement);

        if (!isOwner) continue;

        const isBasic = isBasicSave(save);

        for (let i = 0; i < clonedDamageRows.length; i++) {
            if (isSplashTarget && i !== data.splashIndex) continue;

            const clonedDamageRow = clonedDamageRows[i];
            const clone = clonedDamageRow.cloneNode(true) as HTMLElement;

            clone.dataset.rollIndex = String(i);
            clone.dataset.targetUuid = uuid;

            clone.classList.toggle(
                "applied",
                !!applied[i] || (isBasic && save.result.success === "criticalSuccess")
            );

            if (isBasic) {
                const success: DegreeOfSuccessString = (() => {
                    const actor = target.actor;

                    if (
                        save.result.unadjustedOutcome !== "failure" ||
                        !actor?.isOfType("character") ||
                        actor.saves[save.statistic].rank !== 4
                    )
                        return save.result.success;

                    for (const item of actorItems(actor, "feat")) {
                        const sourceId = item.sourceId;
                        if (!sourceId) continue;

                        if (sourceId === THIRD_PATH_TO_PERFECTION) {
                            const selection = getChoiceSetSelection(item, {
                                flag: "pathToPerfection",
                            });

                            if (selection === save.statistic) {
                                return "success";
                            }
                        } else if (LEGENDARY_SAVES.includes(sourceId)) {
                            return "success";
                        }
                    }

                    return save.result.success;
                })();

                clone.classList.add(success);
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

function isValidCheckLink(el: Maybe<Element | EventTarget>): el is HTMLAnchorElement & {
    dataset: CheckLinkData;
} {
    if (!(el instanceof HTMLAnchorElement) || !el.classList.contains("inline-check")) return false;
    const { pf2Dc, against, itemUuid, pf2Check } = el.dataset;
    return (!!pf2Dc || !!(against && itemUuid)) && SAVE_TYPES.includes(pf2Check);
}

let BASIC_SAVE_REGEX: RegExp;
function getSaveLinkData(el: HTMLAnchorElement & { dataset: CheckLinkData }): SaveLinkData | null {
    const dataset = el.dataset;

    const dc = (() => {
        if ("pf2Dc" in dataset) {
            return Number(dataset.pf2Dc);
        }

        const actor = fromUuidSync<ItemPF2e>(dataset.itemUuid)?.actor;
        if (!actor) return;

        return actor.getStatistic(dataset.against)?.dc.value;
    })();

    if (dc == null || isNaN(dc)) return null;

    const data: SaveLinkData = {
        dc,
        basic: false,
        statistic: dataset.pf2Check as SaveType,
        options: splitListString(dataset.pf2RollOptions ?? ""),
        traits: splitListString(dataset.pf2Traits ?? ""),
    };

    if (dataset.isBasic == null) {
        const label = el.querySelector("span.label")?.lastChild?.textContent?.trim();

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

    return data;
}

function onDragStart(event: DragEvent) {
    const target = event.target;
    const dataTransfer = event.dataTransfer;
    if (!dataTransfer || !isValidCheckLink(target)) return;

    const saveData = getSaveLinkData(target);
    if (saveData === null) {
        event.preventDefault();
        return;
    }

    event.stopPropagation();

    dataTransfer.setData(
        "text/plain",
        JSON.stringify({
            ...saveData,
            type: `${MODULE.id}-check-roll`,
        } satisfies SaveDragData)
    );
}

function onChatMessageDrop(event: DragEvent) {
    const target = htmlClosest<HTMLLIElement>(event.target, "li.chat-message");
    if (!target) return;

    const data = TextEditor.getDragEventData(event);
    if (!data) return;

    const { type, dc, basic, options, statistic, traits } = data as SaveDragData;
    if (type !== `${MODULE.id}-check-roll`) return;

    const messageId = target.dataset.messageId;
    const message = messageId ? (game.messages.get(messageId) as ChatMessagePF2e) : undefined;
    if (!message) return;

    const isDamage = isDamageMessage(message);
    const isAction =
        !isDamage && isActionMessage(message) && !message.content.match(REPOST_CHECK_MESSAGE_REGEX);
    if (!isDamage && !isAction) return;

    if (!game.user.isGM && !message.isAuthor) {
        localize.warn("drop.unauth");
        return;
    }

    if (getMessageFlag(message, "save")) {
        localize.warn("drop.already");
        return;
    }

    const updates = {};

    setFlagProperty(updates, "save", {
        basic,
        dc,
        statistic,
    } satisfies MessageSaveFlag);

    setFlagProperty(updates, "rollOptions", [...options, ...traits]);

    message.update(updates);

    localize.info("drop.added");
}

async function onTargetButton(event: MouseEvent, btn: HTMLButtonElement, message: ChatMessagePF2e) {
    const { rollIndex, targetUuid } = elementDataset(htmlClosest(btn, "[data-target-uuid]")!);
    const target = await fromUuid(targetUuid);
    if (!isValidToken(target)) return;

    const { action } = elementDataset<{ action: TargetButtonAction }>(btn);

    if (action === "target-shield-block") {
        const messageId = message.id;

        if (!btn.classList.contains("shield-activated")) {
            toggleOffShieldBlock(messageId);
        }

        requestAnimationFrame(() => {
            onClickShieldBlock(btn, htmlClosest(btn, ".chat-message")!, target);
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
    const splashIndex = getMessageFlag(message, "splashIndex");

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

function addSaveHeaders(data: MessageData, message: ChatMessagePF2e, afterElement: HTMLElement) {
    const { targets, save } = data;
    if (!targets.length) return;

    const rowsWrapper = createHTMLElement("div", { classes: ["pf2e-toolbelt-target-targetRows"] });

    for (const { template, uuid } of targets) {
        const hrElement = createHTMLElement("hr");
        const rowElement = createHTMLElement("div", {
            dataset: { targetUuid: uuid },
            classes: ["target-header"],
            innerHTML: template,
        });

        rowsWrapper.append(hrElement);
        rowsWrapper.append(rowElement);
    }

    afterElement.after(rowsWrapper);

    addHeaderListeners(message, rowsWrapper, save);
}

async function spellChatMessageGetHTML(message: ChatMessagePF2e, html: HTMLElement) {
    const data = await getMessageData(message);
    if (!dataHasSave(data)) return;

    const msgContent = htmlQuery(html, ".message-content");
    const cardBtns = htmlQuery(msgContent, ".card-buttons");
    const saveBtn = htmlQuery<HTMLButtonElement>(cardBtns, "[data-action='spell-save']");
    if (!msgContent || !cardBtns || !saveBtn) return;

    const wrapper = createHTMLElement("div", { classes: ["pf2e-toolbelt-target-wrapper"] });

    saveBtn.classList.add("hidden");

    const fakeBtn = createHTMLElement("button", {
        innerHTML: saveBtn.innerHTML,
        dataset: {
            ownerTitle: saveBtn.dataset.ownerTitle,
        },
    });

    fakeBtn.title = saveBtn.title;

    linkSaveBtns(saveBtn, fakeBtn, message, data);

    wrapper.append(saveBtn, fakeBtn);

    if (game.user.isGM || message.isAuthor) {
        const setTargetsBtn = createSetTargetsBtn(message);
        wrapper.prepend(setTargetsBtn);

        const rollSavesBtn = createRollSavesBtn(message, data);
        if (rollSavesBtn) {
            wrapper.append(rollSavesBtn);
        }
    }

    cardBtns.prepend(wrapper);

    addSaveHeaders(data, message, msgContent);
}

function linkSaveBtns(
    realBtn: HTMLButtonElement | HTMLAnchorElement,
    fakeBtn: HTMLButtonElement | HTMLAnchorElement,
    message: ChatMessagePF2e,
    data: MessageDataWithSave
) {
    const msgSaves = getMessageFlag(message, "saves") ?? {};
    const allTargets = data.targets.map((target) => target.uuid);

    fakeBtn.addEventListener("click", (event) => {
        event.preventDefault();

        const selected = game.user.getActiveTokens();
        const targets: TokenDocumentPF2e[] = [];
        const remainSelected: TokenDocumentPF2e[] = [];
        const clickEvent = new MouseEvent("click", event);

        for (var i = selected.length - 1; i >= 0; i--) {
            const token = selected[i];

            if (!(token.id in msgSaves) && allTargets.includes(token.uuid)) {
                targets.push(token);
            } else {
                remainSelected.push(token);
            }
        }

        if (remainSelected.length) {
            setControlled(remainSelected);
        }

        if (remainSelected.length || !targets.length) {
            realBtn.dispatchEvent(clickEvent);
        }

        if (targets.length) {
            rollSaves(event as MouseEvent, message, data.save, targets);
        }
    });
}

function dataHasSave(data: Maybe<MessageData>): data is MessageDataWithSave {
    return !!data && "save" in data;
}

function userCanRollSaves(data: Maybe<MessageData>): data is MessageDataWithSave {
    return dataHasSave(data) && game.user.isGM && data.canRollSave.length > 0;
}

function createRollSavesBtn(message: ChatMessagePF2e, data: Maybe<MessageData>, isAnchor = false) {
    if (!userCanRollSaves(data)) return;

    const btnElement = createHTMLElement(isAnchor ? "a" : "button", {
        classes: ["pf2e-toolbelt-target-rollSaves"],
        dataset: { action: "roll-saves" },
        innerHTML: "<i class='fa-duotone fa-solid fa-dice-d20'></i>",
    });

    btnElement.title = localize("rollSaves");

    addRollSavesListener(btnElement, message, data);

    return btnElement;
}

function addRollSavesListener(
    el: HTMLElement,
    message: ChatMessagePF2e,
    { save, canRollSave }: MessageDataWithSave
) {
    el.addEventListener("click", async (event) => {
        event.stopPropagation();

        const targets = R.pipe(
            await Promise.all(canRollSave.map((uuid) => fromUuid(uuid))),
            R.filter((token) => isValidToken(token))
        );

        if (targets.length) {
            rollSaves(event as MouseEvent, message, save, targets);
        }
    });
}

function addSetTargetsListener(
    el: HTMLElement,
    message: ChatMessagePF2e,
    targetKey: "targets" | "splashTargets" = "targets"
) {
    el.addEventListener("click", async (event) => {
        event.stopPropagation();

        const targets = getCurrentTargets();
        const updates = {
            targetHelper: {
                [targetKey]: targets,
            },
        };

        const otherKey = targetKey === "splashTargets" ? "targets" : "splashTargets";
        const otherTargets = getMessageFlag(message, otherKey)?.slice();

        if (otherTargets) {
            updates.targetHelper[otherKey] = otherTargets.filter((uuid) => !targets.includes(uuid));
        }

        await updateFlag(message, updates);
        requestAnimationFrame(() => ui.chat.scrollBottom({ popout: true, waitImages: true }));
    });
}

function createSetTargetsBtn(message: ChatMessagePF2e, isAnchor = false) {
    const btnElement = createHTMLElement(isAnchor ? "a" : "button", {
        classes: ["pf2e-toolbelt-target-setTargets"],
        dataset: { action: "set-targets" },
        innerHTML: "<i class='fa-solid fa-bullseye-arrow'></i>",
    });

    btnElement.title = localize("setTargets");

    addSetTargetsListener(btnElement, message);

    return btnElement;
}

async function addHeaderListeners(
    message: ChatMessagePF2e,
    html: HTMLElement,
    save?: MessageSaveDataWithTooltip
) {
    const targetElements = html.querySelectorAll<HTMLElement>("[data-target-uuid]");

    for (const targetElement of targetElements) {
        const { targetUuid } = elementDataset(targetElement);
        const target = await fromUuid(targetUuid);
        if (!isValidToken(target)) continue;

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
    targets: TokenDocumentPF2e[]
) {
    const user = game.user;
    const updates: Record<string, MessageTargetSave> = {};
    const msgSaves = getMessageFlag(message, "saves") ?? {};

    await Promise.all(
        targets.map((target) => {
            if (target.id in msgSaves) return;

            const actor = target.actor as CreaturePF2e;
            if (!actor) return;

            const save = actor.saves[statistic];
            if (!save) return;

            const item = message.item;
            const rollOptions = getMessageFlag(message, "rollOptions");
            const skipDefault = !user.settings.showCheckDialogs;
            const skipDialog = targets.length > 1 || (event.shiftKey ? !skipDefault : skipDefault);

            return new Promise<void>((resolve) => {
                save.check.roll({
                    event,
                    dc: { value: dc },
                    item,
                    origin: message.actor,
                    skipDialog,
                    extraRollOptions: rollOptions,
                    createMessage: false,
                    callback: async (roll, success, msg) => {
                        const isPrivate =
                            msg.whisper.filter((userId) => game.users.get(userId)?.isGM).length > 0;

                        await roll3dDice(roll, target, isPrivate, false);

                        const context = msg.getFlag<CheckContextChatFlag>("pf2e", "context")!;
                        const modifiers = msg.getFlag<RawModifier[]>("pf2e", "modifiers")!;

                        const data: MessageTargetSave = {
                            private: isPrivate,
                            value: roll.total,
                            die: (roll.terms[0] as foundry.dice.terms.NumericTerm).total,
                            success: success!,
                            roll: JSON.stringify(roll.toJSON()),
                            dosAdjustments: context.dosAdjustments,
                            unadjustedOutcome: context.unadjustedOutcome,
                            notes: context.notes,
                            modifiers: modifiers
                                .filter((modifier) => modifier.enabled)
                                .map(({ label, modifier }) => ({ label, modifier })),
                            significantModifiers:
                                window.pf2eMm?.getSignificantModifiersOfMessage(msg),
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

function getTargetSave(message: ChatMessagePF2e, targetId: string) {
    return getMessageFlag(message, "saves")?.[targetId];
}

function getAppliedDamage(message: ChatMessagePF2e, targetId: string) {
    return getMessageFlag(message, "applied")?.[targetId] ?? [];
}

async function rerollSave(
    event: MouseEvent,
    message: ChatMessagePF2e,
    { dc, statistic }: MessageSaveData,
    target: TokenDocumentPF2e
) {
    const actor = target?.actor as CreaturePF2e | undefined;
    if (!actor) return;

    const flag = getTargetSave(message, target.id);
    if (!flag?.roll || flag.rerolled) return;

    const content = R.pipe(
        R.entries(REROLL),
        actor.isOfType("character") && actor.heroPoints.value > 0
            ? R.identity()
            : R.filter(([type]) => type !== "hero"),
        R.map(([type, { icon, reroll }], i) => {
            const label = game.i18n.localize(reroll);
            const checked = i === 0 ? "checked" : "";

            return `<label>
                <input type="radio" name="reroll" value="${type}" ${checked}>
                <i class="${icon}"></i> ${label}
            </label>`;
        }),
        R.filter(R.isTruthy),
        R.join("")
    );

    const result = await waitDialog<{ reroll: keyof typeof REROLL }>("reroll", {
        title: `${target.name} - ${localize("reroll.title")}`,
        content,
        yes: "fa-solid fa-rotate rotate",
    });

    if (result === null) return;

    const reroll = result.reroll;
    const isHeroReroll = result.reroll === "hero";
    const keep = isHeroReroll ? "new" : result.reroll;

    if (isHeroReroll) {
        const { value, max } = (actor as CharacterPF2e).heroPoints;

        if (value < 1) {
            localize.warn("reroll.noPoints");
            return;
        }

        await actor.update({
            "system.resources.heroPoints.value": Math.clamp(value - 1, 0, max),
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

    const newRoll = await unevaluatedNewRoll.evaluate({ allowInteractive: !flag.private });
    await roll3dDice(newRoll, target, flag.private, false);

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
    const rollOptions = getMessageFlag(message, "rollOptions") ?? [];
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
        private: flag.private,
        value: keptRoll.total,
        die: (keptRoll.terms[0] as foundry.dice.terms.NumericTerm).total,
        success: outcome,
        roll: JSON.stringify(keptRoll.toJSON()),
        dosAdjustments: foundry.utils.deepClone(flag.dosAdjustments),
        modifiers: foundry.utils.deepClone(flag.modifiers),
        notes: notes.map((note) => note.toObject()),
        rerolled: reroll,
        significantModifiers: window.pf2eMm?.getSignificantModifiersOfMessage({
            ...message,
            rolls: [newRoll],
        }),
    };

    if (keptRoll.options.keeleyAdd10) {
        data.modifiers.push({
            label: localize("reroll.keeley"),
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
    target: Maybe<TokenDocumentPF2e> | string,
    isPrivate: boolean,
    self: boolean
) {
    if (!game.dice3d) return;

    const user = game.user;
    const synchronize = !self && game.pf2e.settings.metagame.breakdowns;

    roll = roll instanceof Roll ? roll : Roll.fromData<Rolled<CheckRoll>>(roll);
    target = typeof target === "string" ? await fromUuid<TokenDocumentPF2e>(target) : target;

    if (!self && !synchronize) {
        socket.emit({
            type: "dice-so-nice",
            roll: roll.toJSON(),
            target: target?.uuid,
            private: isPrivate,
        });
    } else if (
        self &&
        !user.isGM &&
        showGhostDiceOnPrivate() &&
        (!target?.playersCanSeeName || isPrivate)
    ) {
        roll.ghost = true;
    }

    return game.dice3d.showForRoll(roll, user, synchronize);
}

function showGhostDiceOnPrivate() {
    const dsn = getActiveModule("dice-so-nice");
    return !!dsn && dsn.getSetting<"0" | "1" | "2">("showGhostDice") !== "0";
}

async function getMessageData(
    message: ChatMessagePF2e,
    onlyWithSave = false
): Promise<MessageData | undefined> {
    const save = getSaveData(message) as MessageSaveDataWithTooltip | undefined;
    if (onlyWithSave && !save) return;

    const targetsFlag = getMessageTargets(message);
    const splashIndex = getMessageFlag(message, "splashIndex") ?? -1;
    const splashTargetsFLag = (getMessageFlag(message, "splashTargets") ?? []).filter(
        (uuid) => !targetsFlag.includes(uuid)
    );
    if (!targetsFlag.length && !splashTargetsFLag.length && !save && splashIndex === -1) return;

    const user = game.user;
    const isGM = user.isGM;
    const author = save?.author ? await fromUuid<ActorPF2e>(save.author) : undefined;
    const showDC = isGM || game.pf2e.settings.metagame.dcs || author?.hasPlayerOwner;
    const showBreakdowns = isGM || game.pf2e.settings.metagame.breakdowns;
    const showResults = isGM || game.pf2e.settings.metagame.results;
    const showSignificant =
        showBreakdowns ||
        (game.modules.get("pf2e-modifiers-matter")?.active &&
            game.settings.get<boolean>(
                "pf2e-modifiers-matter",
                "always-show-highlights-to-everyone"
            ));

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

    let hasTargets = false;
    let hasSplashTargets = false;

    const canRollSave: string[] = [];
    const allTargetsFlags = [
        ["target", targetsFlag],
        ["splash", splashTargetsFLag],
    ] as const;

    const allTargets = await Promise.all(
        allTargetsFlags.flatMap(([type, uuids]) =>
            uuids.map(async (tokenUUID) => {
                const target = await fromUuid(tokenUUID);
                if (!isValidToken(target)) return;

                const targetId = target.id;
                const targetActor = target.actor as CreaturePF2e;
                if (!targetActor) return;

                const isHidden =
                    target.hidden || targetActor.hasCondition("unnoticed", "undetected");
                if (!isGM && isHidden) return;

                const isOwner = targetActor.isOwner;
                const hasPlayerOwner = targetActor.hasPlayerOwner;
                const isFriendly = isOwner || hasPlayerOwner;
                const hasSave = save && !!targetActor.saves?.[save.statistic];
                const saveFlag = getTargetSave(message, targetId);

                if (hasSave && !hasPlayerOwner && !saveFlag) {
                    canRollSave.push(tokenUUID);
                }

                const targetSave: TargetSaveResult | undefined = await (async () => {
                    if (!hasSave || !saveFlag) return;

                    const rerolled = saveFlag.rerolled;
                    const canReroll = hasSave && isOwner && !rerolled;
                    const offset = saveFlag.value - save.dc;
                    const isPrivate = saveFlag.private && !hasPlayerOwner;
                    const canSeeResult = isGM || !isPrivate;

                    const adjustment = (() => {
                        if (
                            (!isFriendly && !showBreakdowns) ||
                            !saveFlag.unadjustedOutcome ||
                            !saveFlag.dosAdjustments ||
                            saveFlag.success === saveFlag.unadjustedOutcome
                        )
                            return;

                        const adjustments = R.filter(
                            [
                                saveFlag.dosAdjustments[saveFlag.unadjustedOutcome]?.label,
                                saveFlag.dosAdjustments.all?.label,
                            ],
                            R.isTruthy
                        );

                        return adjustments.length
                            ? adjustments.map((x) => game.i18n.localize(x)).join(", ")
                            : undefined;
                    })();

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

                    const significantList =
                        foundry.utils.deepClone(saveFlag.significantModifiers) ?? [];

                    const hasSignificantModifiers = R.pipe(
                        significantList,
                        R.map(({ value, significance }) => ({
                            value: Math.abs(value),
                            css: significance,
                        })),
                        R.firstBy([R.prop("value"), "desc"])
                    )?.css;

                    const modifiers =
                        isFriendly || showBreakdowns
                            ? saveFlag.modifiers.map(({ label, modifier }) => {
                                  const significant = significantList.findSplice(
                                      ({ name, value }) => name === label && modifier === value
                                  );
                                  return {
                                      name: label.replace(/(.+) \d+/, "$1"),
                                      value: modifier,
                                      css: significant?.significance ?? "NONE",
                                  };
                              })
                            : [];

                    const significantModifiers =
                        isFriendly || showSignificant
                            ? significantList.map(({ name, significance, value }) => ({
                                  name: name.replace(/(.+) \d+/, "$1"),
                                  value,
                                  css: significance,
                              }))
                            : [];

                    return {
                        ...saveFlag,
                        notes: notesList?.outerHTML,
                        canReroll,
                        isPrivate,
                        canSeeResult,
                        hasSignificantModifiers: hasSignificantModifiers
                            ? `has-significant-modifiers ${hasSignificantModifiers}`
                            : undefined,
                        tooltip: await render("tooltip", {
                            check: save.tooltipLabel,
                            result: result
                                ? localize("tooltip.result.format", { result })
                                : undefined,
                            modifiers: modifiers.concat(significantModifiers),
                            adjustment,
                            canReroll,
                            rerolled: rerolled ? REROLL[rerolled] : undefined,
                        }),
                    } satisfies TargetSaveResult;
                })();

                const templateSave: TargetSave | undefined = save && {
                    ...save,
                    result: targetSave,
                };

                const canSeeName =
                    isGM || !game.pf2e.settings.tokens.nameVisibility || target.playersCanSeeName;
                const name = canSeeName ? target.name : localize("unnamed");

                const applied = getAppliedDamage(message, targetId);

                if (type === "splash") {
                    hasSplashTargets ||= true;
                } else {
                    hasTargets ||= true;
                }

                return {
                    isOwner,
                    canSeeName,
                    hasPlayerOwner,
                    uuid: tokenUUID,
                    target,
                    applied,
                    save: templateSave,
                    isSplashTarget: type === "splash",
                    template: await render("header", {
                        name,
                        isGM,
                        isOwner,
                        hasPlayerOwner,
                        isHidden,
                        showSuccess: isFriendly || showResults,
                        messageSave: templateSave,
                        save: hasSave && templateSave,
                        canReroll: targetSave?.canReroll,
                        isPrivate: isGM && targetSave?.isPrivate,
                        canSeeResult: targetSave?.canSeeResult,
                        rerolled: targetSave?.rerolled ? REROLL[targetSave.rerolled] : undefined,
                    }),
                } satisfies MessageDataTarget;
            })
        )
    );

    const targets = R.filter(allTargets, R.isTruthy);

    if (isGM) {
        targets.sort((a, b) => Number(a.hasPlayerOwner) - Number(b.hasPlayerOwner));
    } else {
        targets.sort((a, b) =>
            !a.isOwner && !b.isOwner
                ? Number(b.hasPlayerOwner) - Number(a.hasPlayerOwner)
                : Number(b.isOwner) - Number(a.isOwner)
        );
    }

    return {
        targets,
        save,
        canRollSave,
        hasTargets,
        hasSplashTargets,
        splashIndex,
        isRegen: !!getMessageFlag(message, "isRegen"),
    };
}

function getSaveData(message: ChatMessagePF2e): MessageSaveData | undefined {
    const flag = getMessageFlag(message, "save");
    if (!flag) return;

    return {
        ...flag,
        ...SAVES[flag.statistic],
    };
}

function isValidToken(doc: Maybe<ClientDocument>): doc is TokenDocumentPF2e {
    if (!isInstanceOf(doc, "TokenDocumentPF2e")) return false;

    const actor = doc.actor;
    return (
        !!actor &&
        (actor.isOfType("creature", "vehicle") ||
            (actor.isOfType("hazard") && !!actor.hitPoints?.max))
    );
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

type MessageDataWithSave = Omit<MessageData, "save"> & { save: MessageSaveDataWithTooltip };

type MessageTargetSave = {
    private: boolean;
    value: number;
    die: number;
    success: DegreeOfSuccessString;
    roll: string;
    notes: RollNoteSource[];
    dosAdjustments: DegreeAdjustmentsRecord | undefined;
    unadjustedOutcome?: DegreeOfSuccessString | null;
    modifiers: { label: string; modifier: number }[];
    significantModifiers: modifiersMatter.SignificantModifier[] | undefined;
    rerolled?: keyof typeof REROLL;
};

type TargetMessageType = "damage" | "spell-damage" | "spell-save" | "action" | "check";

type MessageFlag = {
    type?: TargetMessageType;
    targets?: string[];
    save?: MessageSaveFlag;
    saves?: Record<string, MessageTargetSave>;
    splashIndex?: number;
    isRegen?: boolean;
    applied?: Record<string, boolean[]>;
    rollOptions?: string[];
    splashTargets?: string[];
};

type CheckLinkData = { pf2Check: SaveType } & (
    | { against: string; itemUuid: string }
    | { pf2Dc: StringNumber }
);

type TargetSaveResult = Omit<MessageTargetSave, "notes"> & {
    canReroll: boolean;
    tooltip: string;
    notes: string | undefined;
    isPrivate: boolean;
    canSeeResult: boolean;
    hasSignificantModifiers: string | undefined;
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
          private: boolean;
      }
    | {
          type: "update-save";
          message: string;
          updates: Record<string, MessageTargetSave>;
      };

type SaveLinkData = {
    basic: boolean;
    dc: number;
    statistic: SaveType;
    options: string[];
    traits: string[];
};

type SaveDragData = SaveLinkData & {
    type: `${typeof MODULE.id}-check-roll`;
};

type MessageDataTarget = {
    isOwner: boolean;
    canSeeName: boolean;
    hasPlayerOwner: boolean;
    uuid: string;
    target: TokenDocumentPF2e;
    applied: boolean[];
    save: TargetSave | undefined;
    isSplashTarget: boolean;
    template: string;
};

type MessageData = {
    targets: MessageDataTarget[];
    save: MessageSaveDataWithTooltip | undefined;
    canRollSave: string[];
    isRegen: boolean;
    hasTargets: boolean;
    hasSplashTargets: boolean;
    splashIndex: number;
};

export {
    getMessageTargets,
    setFlagProperty as setTargetHelperFlagProperty,
    config as targetHelperTool,
};
