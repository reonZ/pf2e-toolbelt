import {
    R,
    addListener,
    addListenerAll,
    afterHTMLFromString,
    appendHTMLFromString,
    closest,
    elementData,
    getOwner,
    hasGMOnline,
    querySelector,
    querySelectorArray,
    refreshApplication,
    renderCharacterSheets,
} from "pf2e-api";
import { createTool } from "../tool";
import {
    CHARACTER_SHEET_ACTIVATE_LISTENERS,
    CHARACTER_SHEET_RENDER_INNER,
} from "./shared/characterSheet";

const TABLE_UUID = "Compendium.pf2e.rollable-tables.RollTable.zgZoI7h0XjjJrrNK";
const JOURNAL_UUID = "Compendium.pf2e.journals.JournalEntry.BSp4LUSaOmUyjBko";

const {
    config,
    settings,
    localize,
    wrappers,
    socket,
    waitDialog,
    render,
    getFlag,
    setFlag,
    setFlagProperty,
} = createTool({
    name: "heroActions",
    settings: [
        {
            key: "enabled",
            type: Boolean,
            default: false,
            onChange: (value) => {
                wrappers.toggleAll(value);
                socket.toggle(value);
                renderCharacterSheets();
            },
        },
        {
            key: "table",
            type: String,
            default: "",
        },
        {
            key: "count",
            type: Number,
            default: 0,
            range: {
                min: 0,
                max: 10,
                step: 1,
            },
            onChange: renderCharacterSheets,
        },
        {
            key: "trade",
            type: Boolean,
            default: true,
            onChange: renderCharacterSheets,
        },
        {
            key: "private",
            type: Boolean,
            default: false,
        },
    ],
    wrappers: [
        {
            path: CHARACTER_SHEET_RENDER_INNER,
            callback: characterSheetPF2eRenderInner,
        },
        {
            path: CHARACTER_SHEET_ACTIVATE_LISTENERS,
            callback: characterSheetPF2eActivateListeners,
        },
    ],
    api: {
        canTrade,
        discardHeroActions,
        drawHeroAction,
        drawHeroActions,
        getDeckTable,
        getHeroActionDetails,
        getHeroActions,
        giveHeroActions,
        removeHeroActions,
        sendActionToChat,
        tradeHeroAction,
        usesCountVariant,
        useHeroAction,
    },
    onSocket: (packet: SocketPacket, senderId) => {
        switch (packet.type) {
            case "trade-request": {
                if (packet.receiver.id === game.user.id) {
                    onTradeRequest(packet, senderId);
                }
                break;
            }
            case "trade-error": {
                if (packet.sender.id === game.user.id) {
                    onTradeError(packet, senderId);
                }
                break;
            }
            case "trade-reject": {
                if (packet.sender.id === game.user.id) {
                    onTradeRejected(packet, senderId);
                }
                break;
            }
            case "trade-accept": {
                if (game.users.activeGM === game.user) {
                    onTradeAccepted(packet, senderId);
                }
                break;
            }
        }
    },
    ready: () => {
        const enabled = settings.enabled;
        wrappers.toggleAll(enabled);
        socket.toggle(enabled);
    },
} as const);

function canTrade() {
    return settings.trade;
}

function usesCountVariant() {
    return settings.count > 0;
}

async function characterSheetPF2eRenderInner(this: CharacterSheetPF2e, html: HTMLElement) {
    const actor = this.actor;
    const actions = getHeroActions(actor);
    const usesCount = usesCountVariant();
    const heroPoints = actor.heroPoints.value;
    const diff = heroPoints - actions.length;
    const mustDiscard = !usesCount && diff < 0;
    const mustDraw = !usesCount && diff > 0;

    const template = await render("sheet", {
        actions,
        usesCount,
        mustDiscard,
        mustDraw,
        canUse: (usesCount && heroPoints > 0) || diff >= 0,
        canTrade: actions.length && !mustDiscard && !mustDraw && canTrade(),
        diff: Math.abs(diff),
        isOwner: actor.isOwner,
        isGM: game.user.isGM,
    });

    const tab = querySelector(html, ".tab[data-tab=actions] .tab-content .tab[data-tab=encounter]");
    const attacks = querySelector(tab, ":scope > .strikes-list:not(.skill-action-list)");

    afterHTMLFromString(attacks, template);
}

function characterSheetPF2eActivateListeners(this: CharacterSheetPF2e, html: HTMLElement) {
    const actor = this.actor;
    const tab = querySelector(html, ".tab[data-tab=actions] .tab-content .tab[data-tab=encounter]");
    const list = querySelector(tab, ".heroActions-list");
    if (!list || !tab) return;

    addListener(tab, "[data-action='hero-actions-draw']", () => drawHeroActions(actor));
    addListener(tab, "[data-action='hero-actions-trade']", () => tradeHeroAction(actor, this));

    if (game.user.isGM) {
        addListener(tab, "[data-action='give-actions']", () => giveHeroActions(actor));
    }

    const addActionListener = (
        action: string,
        callback: (actor: CharacterPF2e, uuid: string, el: HTMLElement) => void
    ) => {
        addListenerAll(list, `[data-action="${action}"]`, (event: Event, el: HTMLElement) => {
            const actionEl = closest(el, "[data-uuid]");
            if (!actionEl) return;

            const { uuid } = elementData(actionEl);
            callback(actor, uuid, actionEl);
        });
    };

    addActionListener("hero-action-discard", onDiscardAction);
    addActionListener("hero-action-use", useHeroAction);
    addActionListener("hero-action-chat", sendActionToChat);
    addActionListener("hero-action-expand", onExpandAction);
}

function isValidActor(actor: CharacterPF2e) {
    if (actor?.isOfType("character")) return true;
    localize.warn("error.onlyCharacter");
    return false;
}

function getTradeDataFromPacket(packet: SocketPacket) {
    const sender = game.actors.get(packet.sender.cid) as ActorPF2e;
    const receiver = game.actors.get(packet.receiver.cid) as ActorPF2e;

    if (!sender?.isOfType("character") || !receiver?.isOfType("character")) {
        socket.emit({
            ...packet,
            type: "trade-error",
        });
        return;
    }

    const senderActions = getHeroActions(sender);
    const receiverActions = getHeroActions(receiver);
    const senderActionIndex = senderActions.findIndex((x) => x.uuid === packet.sender.uuid);
    const receiverActionIndex = receiverActions.findIndex((x) => x.uuid === packet.receiver.uuid);

    if (senderActionIndex === -1 || (packet.receiver.uuid && receiverActionIndex === -1)) {
        socket.emit({
            ...packet,
            type: "trade-error",
        });
        return;
    }

    return {
        sender: {
            actor: sender,
            actions: senderActions,
            index: senderActionIndex,
        },
        receiver: {
            actor: receiver,
            actions: receiverActions,
            index: receiverActionIndex,
        },
    };
}

function onTradeError(packet: SocketPacket, senderId: string) {
    localize.error("error.tradeError", {
        sender: game.actors.get(packet.sender.cid)?.name ?? packet.sender.cid,
        receiver: game.actors.get(packet.receiver.cid)?.name ?? packet.receiver.cid,
    });
}

function onTradeRejected(packet: SocketPacket, senderId: string) {
    localize.warn("trade.rejected", {
        sender: game.actors.get(packet.sender.cid)?.name ?? packet.sender.cid,
        receiver: game.actors.get(packet.receiver.cid)?.name ?? packet.receiver.cid,
    });
}

function onTradeAccepted(packet: SocketPacket, senderId: string) {
    const data = getTradeDataFromPacket(packet);
    if (!data) return;

    const { sender, receiver } = data;
    exchangeHeroActions(sender, receiver, senderId);
}

async function onTradeRequest(packet: SocketPacket, senderId: string) {
    const data = getTradeDataFromPacket(packet);
    if (!data) return;

    const { sender, receiver } = data;
    const isPrivate = settings.private;
    const translate = localize.sub("trade.request");
    const flavor = translate("flavor", {
        sender: sender.actor.name,
        receiver: receiver.actor.name,
    });

    let content = `<div>${flavor}</div>`;

    if (isPrivate) {
        const rows = receiver.actions.map(({ uuid, name }, i) => {
            const checked = i === 0 ? "checked" : "";
            return `<div class="action" data-uuid="${uuid}">
                <input type="radio" name="action" value="${uuid}" ${checked} />
                <label data-action="description"> ${name}</label>
            </div>`;
        });

        content += rows.join("");
    } else {
        const give = translate("give", {
            give: `@UUID[${packet.sender.uuid}]`,
        });
        const want = translate("want", {
            want: `@UUID[${packet.receiver.uuid}]`,
        });

        content += `<div>${give}</div><div>${want}</div>`;
    }

    const html = await waitDialog("trade.request", {
        yes: "fa-solid fa-handshake",
        content: await TextEditor.enrichHTML(content),
        onRender: (html) => {
            addListenerAll(html, "[data-action='description']", async (event, el) => {
                const action = closest(el, ".action");
                if (!action) return;

                const { uuid } = elementData(action);
                const entry = await fromUuid(uuid);
                entry?.sheet.render(true);
            });
        },
    });

    if (html === null) {
        socket.emit({
            ...packet,
            type: "trade-reject",
        });
        return;
    }

    if (isPrivate) {
        packet.receiver.uuid = querySelector<HTMLInputElement>(
            html,
            "[name='action']:checked"
        )!.value;
    }

    if (game.user.isGM) {
        exchangeHeroActions(sender, receiver, senderId);
        return;
    }

    socket.emit({
        ...packet,
        type: "trade-accept",
    });
}

async function tradeHeroAction(actor: CharacterPF2e, app?: Application) {
    if (!isValidActor(actor)) return;

    if (!hasGMOnline()) {
        localize.error("error.noGM");
        return;
    }

    const actions = getHeroActions(actor);

    if (!actions.length) {
        localize.warn("error.noAction");
        return;
    }

    const heroPoints = actor.heroPoints.value;
    const usesCount = usesCountVariant();

    if (!usesCount && heroPoints < actions.length) {
        localize.warn("error.mustDiscard", { nb: actions.length - heroPoints });
        return;
    }

    const isPrivate = settings.private;
    const others = (game.actors as Actors<ActorPF2e>)
        .filter(
            (x): x is CharacterPF2e => x !== actor && x.isOfType("character") && x.hasPlayerOwner
        )
        .map((x) => ({
            name: x.name,
            id: x.id,
            actions: getHeroActions(x),
            isPrivate: isPrivate && !x.isOwner,
        }))
        .filter((x) => x.actions.length > 0);

    if (others.length === 0) {
        localize.warn("error.noOther");
        return;
    }

    const onRender = (html: HTMLElement) => {
        addListener(html, "[name='target']", "change", (event, el: HTMLSelectElement) => {
            const targetId = el.value;
            const rightEls = html.querySelectorAll<HTMLElement>("[data-target-id]");

            for (const rightEl of rightEls) {
                rightEl.classList.toggle("selected", rightEl.dataset.targetId === targetId);
            }

            if (app) {
                refreshApplication(app);
            }
        });

        addListenerAll(html, "[data-action='description']", async (event, el) => {
            const action = closest(el, ".action");
            if (!action) return;

            const { uuid } = elementData(action);
            const entry = await fromUuid(uuid);
            entry?.sheet.render(true);
        });
    };

    const html = await waitDialog(
        "trade",
        {
            yes: "fa-duotone fa-share-from-square",
            data: {
                actions,
                others,
            },
            onRender,
        },
        { width: 500 }
    );

    if (html === null) return;

    const targetId = querySelector<HTMLSelectElement>(html, ".header [name='target']")?.value;
    const target = targetId ? (game.actors.get(targetId) as CharacterPF2e) : undefined;
    if (!target) return;

    const actionUuid = querySelector<HTMLInputElement>(
        html,
        ".left [name='action']:checked"
    )?.value;
    const targetActionUUid = html.querySelector<HTMLInputElement>(
        `.right [name="action-${targetId}"]:checked`
    )?.value;

    if (!actionUuid || !targetActionUUid) return;

    if (target.isOwner && targetActionUUid) {
        const targetActions = others.find((x) => x.id === targetId)!.actions;

        exchangeHeroActions(
            {
                actor,
                actions,
                index: actions.findIndex((x) => x.uuid === actionUuid),
            },
            {
                actor: target,
                actions: targetActions,
                index: targetActions.findIndex((x) => x.uuid === targetActionUUid),
            }
        );

        return;
    }

    socket.emit({
        type: "trade-request",
        sender: {
            id: game.user.id,
            cid: actor.id,
            uuid: actionUuid,
        },
        receiver: {
            id: getOwner(target)?.id ?? game.users.activeGM!.id,
            cid: targetId!,
            uuid: targetActionUUid,
        },
    });
}

function exchangeHeroActions(trader1: ExchangeObj, trader2: ExchangeObj, senderId?: string) {
    const trader1Action = trader1.actions.splice(trader1.index, 1)[0];
    const trader2Action = trader2.actions.splice(trader2.index, 1)[0];

    trader1.actions.push(trader2Action);
    trader2.actions.push(trader1Action);

    setHeroActions(trader1.actor, trader1.actions);
    setHeroActions(trader2.actor, trader2.actions);

    createActionsMessage(trader1.actor, [trader1Action, trader2Action], "exchanged", {
        senderId,
        other: trader2.actor.name,
    });
}

async function onExpandAction(actor: CharacterPF2e, uuid: string, actionEl: HTMLElement) {
    const duration = 0.4;
    const summaryEl = querySelector(actionEl, ".item-summary")!;

    if (!summaryEl.classList.contains("loaded")) {
        const details = await getHeroActionDetails(uuid);
        if (!details) return;

        const text = await TextEditor.enrichHTML(details.description);
        const descEl = querySelector(summaryEl, ".item-description");

        appendHTMLFromString(descEl, text);
        summaryEl.classList.add("loaded");
    }

    if (summaryEl.hidden) {
        gsap.fromTo(
            summaryEl,
            { height: 0, opacity: 0, hidden: false },
            { height: "auto", opacity: 1, duration }
        );
    } else {
        gsap.to(summaryEl, {
            height: 0,
            duration,
            opacity: 0,
            paddingTop: 0,
            paddingBottom: 0,
            margin: 0,
            clearProps: "all",
            onComplete: () => {
                summaryEl.hidden = true;
            },
        });
    }
}

async function sendActionToChat(actor: CharacterPF2e, uuid: string) {
    if (!isValidActor(actor)) return;

    const details = await getHeroActionDetails(uuid);
    if (!details) return;

    ChatMessage.implementation.create({
        content: `<h3>${details.name}</h3>${details.description}`,
        speaker: ChatMessage.getSpeaker({ actor }),
    });
}

async function useHeroAction(actor: CharacterPF2e, uuid: string) {
    if (!isValidActor(actor)) return;

    const points = actor.heroPoints.value;
    if (points < 1) {
        localize.warn("error.notEnoughPoint");
        return;
    }

    const actions = getHeroActions(actor);
    const index = actions.findIndex((x) => x.uuid === uuid);
    if (index === -1) return;

    actions.splice(index, 1);

    const details = await getHeroActionDetails(uuid);
    if (!details) return;

    const updates = setFlagProperty(
        {
            "system.resources.heroPoints.value": points - 1,
        },
        "actions",
        actions
    );

    actor.update(updates);

    ChatMessage.implementation.create({
        flavor: `<h4 class="action">${localize("message.used")}</h4>`,
        content: `<h3>${details.name}</h3>${details.description}`,
        speaker: ChatMessage.getSpeaker({ actor }),
    });
}

async function getHeroActionDetails(uuid: string) {
    const document = await fromUuid<JournalEntry | JournalEntryPage>(uuid);
    if (!document) {
        localize.error("error.noDetails");
        return;
    }

    const parent = document instanceof JournalEntry ? document : document.parent;
    const page = document instanceof JournalEntry ? document.pages.contents[0] : document;

    let text = page?.text.content;
    if (!text) {
        localize.error("error.noDetails");
        return;
    }

    if (parent.uuid === JOURNAL_UUID) text = text.replace(/^<p>/, "<p><strong>Trigger</strong> ");
    return { name: page.name, description: text };
}

function onDiscardAction(actor: CharacterPF2e, uuid: string, el: HTMLElement) {
    const parent = closest(el, ".actions-list")!;
    const toDiscard = Number(elementData(parent).discard);
    const discarded = querySelectorArray(parent, ".item.discarded").map((x) => elementData(x).uuid);

    if (discarded.includes(uuid)) {
        el.classList.remove("discarded");
    } else if (discarded.length + 1 >= toDiscard) {
        discarded.push(uuid);
        discardHeroActions(actor, discarded);
    } else {
        el.classList.add("discarded");
    }
}

function discardHeroActions(actor: CharacterPF2e, uuids: string[] | string) {
    if (!isValidActor(actor)) return;

    const actions = getHeroActions(actor);
    const removed = [];

    uuids = Array.isArray(uuids) ? uuids : [uuids];

    for (const uuid of uuids) {
        const index = actions.findIndex((x) => x.uuid === uuid);

        if (index !== -1) {
            removed.push(actions[index]);
            actions.splice(index, 1);
        }
    }

    if (removed.length === 0) return;

    setHeroActions(actor, actions);
    createActionsMessage(actor, removed, "discarded");
}

async function drawHeroActions(actor: CharacterPF2e) {
    if (!isValidActor(actor)) return;

    const drawn = [];
    const count = settings.count;
    const usesCount = count > 0;
    const actions = usesCount ? [] : getHeroActions(actor);
    const nb = count || actor.heroPoints.value - actions.length;

    if (nb <= 0) {
        localize.warn("error.notEnoughPoint");
        return;
    }

    for (let i = 0; i < nb; i++) {
        const action = await drawHeroAction();

        if (action === undefined) continue;
        if (action === null) return;

        actions.push(action);
        drawn.push(action);
    }

    if (!drawn.length) return;

    setHeroActions(actor, actions);
    createActionsMessage(actor, drawn, "drawn");
}

function createActionsMessage(
    actor: CharacterPF2e,
    actions: HeroActionFlag[],
    label: "drawn" | "discarded" | "exchanged" | "given",
    { senderId = game.user.id, other }: { senderId?: string; other?: string } = {}
) {
    const links = actions.map(({ uuid }) => `@UUID[${uuid}]`);
    const translate = localize.sub("message");
    const content =
        label === "exchanged"
            ? `<div>${translate("offer", { offer: links[0] })}</div>
            <div>${translate("receive", { receive: links[1] })}</div>`
            : links.map((x) => `<div>${x}</div>`).join("");

    const data: Partial<ChatMessageSourceData> = {
        flavor: `<h4 class="action">${translate(label, { nb: actions.length, name: other })}</h4>`,
        content,
        speaker: ChatMessage.getSpeaker({ actor }),
        author: senderId,
    };

    if (settings.private) {
        data.whisper = game.users
            .filter((user) => user.isGM)
            .map((user) => user.id)
            .concat(senderId);
    }

    ChatMessage.implementation.create(data);
}

async function drawHeroAction() {
    const table = await getDeckTable();
    const translate = localize.sub("table");

    if (!table) {
        translate.error("notFound", true);
        return null;
    }

    if (!table.formula) {
        if (game.user.isGM) {
            if (table.compendium) {
                translate.error("noFormulaCompendium", true);
                return null;
            }
            await table.normalize();
        } else {
            translate.error("noFormula", true);
            return null;
        }
    }

    if (table.replacement === false) {
        const notDrawn = table.results.some((result) => !result.drawn);

        if (!notDrawn) {
            await table.resetResults();
        }
    }

    const draw = (await table.draw({ displayChat: false })).results[0];

    if (!draw) {
        translate.warn("noDraw");
        return;
    }

    const uuid = documentUuidFromTableResult(draw);

    if (!uuid) {
        translate.warn("drawError");
        return;
    }

    const name = await getLabelfromTableResult(draw, uuid);
    return { uuid, name };
}

async function getLabelfromTableResult(result: TableResult, uuid: string) {
    if (result.type !== CONST.TABLE_RESULT_TYPES.TEXT) {
        return result.text;
    }

    const label = /@UUID\[[\w\.]+\]{([\w -]+)}/.exec(result.text)?.[1];
    return label ?? (uuid && (await fromUuid(uuid))?.name);
}

function documentUuidFromTableResult(result: TableResult) {
    if (result.type === CONST.TABLE_RESULT_TYPES.TEXT) {
        return /@UUID\[([\w\.-]+)\]/.exec(result.text)?.[1];
    }
    if (result.type === CONST.TABLE_RESULT_TYPES.DOCUMENT) {
        return `${result.documentCollection}.${result.documentId}`;
    }
    if (result.type === CONST.TABLE_RESULT_TYPES.COMPENDIUM) {
        return `Compendium.${result.documentCollection}.${result.documentId}`;
    }
    return undefined;
}

async function getTableFromUuid(uuid: string) {
    if (!uuid) return undefined;
    const table = await fromUuid(uuid);
    return table && table instanceof RollTable ? table : undefined;
}

function getDefaultWorldTable() {
    return game.tables.find((x) => x.getFlag("core", "sourceId") === TABLE_UUID);
}

async function getDeckTable() {
    return (
        (await getTableFromUuid(settings.table)) ??
        getDefaultWorldTable() ??
        (await getTableFromUuid(TABLE_UUID))
    );
}

function getHeroActions(actor: CharacterPF2e) {
    return getFlag<HeroActionFlag[]>(actor, "actions")?.slice() ?? [];
}

function setHeroActions(actor: CharacterPF2e, actions: HeroActionFlag[]) {
    return setFlag(actor, "actions", actions);
}

async function giveHeroActions(actor: CharacterPF2e) {
    if (!game.user.isGM) {
        localize.warn("error.notGM");
        return;
    }

    if (!isValidActor(actor)) return;

    const table = await getDeckTable();
    if (!table) {
        localize.error("table.notFound", true);
        return null;
    }

    const isUnique = table.replacement === false;
    const actions = getHeroActions(actor);

    const actionsList = (
        await Promise.all(
            table.results.map(async (result) => {
                const uuid = documentUuidFromTableResult(result);
                if (!uuid || actions.find((x) => x.uuid === uuid)) return;

                return {
                    key: result.id,
                    uuid,
                    name: await getLabelfromTableResult(result, uuid),
                    drawn: isUnique && result.drawn,
                };
            })
        )
    ).filter(Boolean);

    const html = await waitDialog("giveActions", {
        yes: "fa-solid fa-gift",
        data: {
            actions: actionsList,
            isUnique,
        },
        onRender: (html) => {
            addListenerAll(html, "[data-action='expand']", (event, el) => {
                const actionEl = closest(el, "[data-uuid]");
                if (!actionEl) return;

                const { uuid } = elementData(actionEl);
                onExpandAction(actor, uuid, actionEl);
            });
        },
    });

    if (!html) return;

    const selected = querySelectorArray(html, "[name='action']:checked").map((el) => {
        const parent = closest(el, ".action")!;
        return elementData<{ uuid: string; name: string; key: string }>(parent);
    });
    const asDrawn = querySelector<HTMLInputElement>(html, "[name='drawn']")?.checked;
    const withMessage = querySelector<HTMLInputElement>(html, "[name='message']")!.checked;
    const tableUpdates = [];

    for (const { uuid, name, key } of selected) {
        actions.push({ uuid, name });
        if (!asDrawn) continue;

        const result = table.results.get(key);
        if (result && !result.drawn) tableUpdates.push(key);
    }

    if (tableUpdates.length) {
        table.updateEmbeddedDocuments(
            "TableResult",
            tableUpdates.map((key) => ({ _id: key, drawn: true }))
        );
    }

    setHeroActions(actor, actions);

    if (withMessage) {
        createActionsMessage(actor, selected, "given");
    }
}

async function removeHeroActions() {
    if (!game.user.isGM) {
        localize.warn("error.notGM");
        return;
    }

    const translate = localize.sub("removeActions");

    const onRender = (html: HTMLElement) => {
        const allInput = querySelector<HTMLInputElement>(html, "[name='all']")!;
        const actorInputs = querySelectorArray<HTMLInputElement>(html, "[name='actor']");

        allInput.addEventListener("change", () => {
            const allChecked = allInput.checked;

            for (const actorInput of actorInputs) {
                actorInput.checked = allChecked;
            }
        });

        for (const actorInput of actorInputs) {
            actorInput.addEventListener("change", () => {
                const actorsChecked = actorInputs.filter((x) => x.checked);

                if (actorInputs.length === actorsChecked.length) {
                    allInput.indeterminate = false;
                    allInput.checked = true;
                } else if (!actorsChecked.length) {
                    allInput.indeterminate = false;
                    allInput.checked = false;
                } else {
                    allInput.indeterminate = true;
                    allInput.checked = actorsChecked.length > actorInputs.length / 2;
                }
            });
        }
    };

    const html = await waitDialog("removeActions", {
        yes: "fa-solid fa-trash",
        data: {
            actors: game.actors.filter((x) => x.type === "character"),
        },
        onRender,
    });

    if (!html) return;

    const actors = R.pipe(
        querySelectorArray<HTMLInputElement>(html, "[name='actor']:checked"),
        R.map((input) => game.actors.get(input.value) as CharacterPF2e),
        R.compact
    );

    if (!actors.length) return;

    for (const actor of actors) {
        setHeroActions(actor, []);
    }

    translate.info("removed");
}

type HeroActionFlag = toolbelt.heroActions.HeroActionFlag;

type SocketPacket = {
    type: "trade-request" | "trade-reject" | "trade-error" | "trade-accept";
    sender: {
        id: string;
        cid: string;
        uuid: string;
    };
    receiver: {
        id: string;
        cid: string;
        uuid?: string;
    };
};

type ExchangeObj = {
    actor: CharacterPF2e;
    actions: HeroActionFlag[];
    index: number;
};

export { config as heroActionsTool };
