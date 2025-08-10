import {
    ActorPF2e,
    addListenerAll,
    CharacterPF2e,
    CharacterSheetData,
    CharacterSheetPF2e,
    ChatMessageSourcePF2e,
    createEmitable,
    createHTMLElement,
    createToggleableWrapper,
    DialogV2RenderCallback,
    displayEmiting,
    FlagDataArray,
    getMythicOrHeroPoints,
    htmlClosest,
    htmlQuery,
    htmlQueryAll,
    primaryPlayerOwner,
    R,
    renderCharacterSheets,
    sharedLocalize,
    socketEmit,
    socketOff,
    socketOn,
    toggleHooksAndWrappers,
    toggleSummary,
    waitDialog,
} from "module-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";
import { HeroActionModel, openDescriptionFromElement, TradeHeroAction } from ".";

class HeroActionsTool extends ModuleTool<HeroActionsSettings> {
    static TABLE_UUID = "Compendium.pf2e.rollable-tables.RollTable.zgZoI7h0XjjJrrNK";
    static JOURNAL_UUID = "Compendium.pf2e.journals.JournalEntry.BSp4LUSaOmUyjBko";

    #drawHeroActionsEmitable = createEmitable(
        this.localizeKey("draw"),
        this.#drawHeroActions.bind(this)
    );

    #onSocket = (options: SocketOptions) => {
        if (options.type === "heroActions.request") {
            game.userId === options.target.user && this.#tradeRequest(options);
        } else if (options.type === "heroActions.reject") {
            game.userId === options.user && this.#tradeReject(options);
        } else if (options.type === "heroActions.exchange") {
            game.user === game.users.activeGM && this.#exchangeActions(options);
        }
    };

    #hooks = [
        createToggleableWrapper(
            "WRAPPER",
            "CONFIG.Actor.sheetClasses.character['pf2e.CharacterSheetPF2e'].cls.prototype._renderInner",
            this.#characterSheetPF2eRenderInner,
            { context: this }
        ),
        createToggleableWrapper(
            "WRAPPER",
            "CONFIG.Actor.sheetClasses.character['pf2e.CharacterSheetPF2e'].cls.prototype.activateListeners",
            this.#characterSheetPF2eActivateListeners,
            { context: this }
        ),
    ];

    get key(): "heroActions" {
        return "heroActions";
    }

    get settingsSchema(): ToolSettingsList<HeroActionsSettings> {
        return [
            {
                key: "enabled",
                type: Boolean,
                default: false,
                scope: "world",
                onChange: () => {
                    this._configurate();
                    renderCharacterSheets();
                },
            },
            {
                key: "table",
                type: String,
                default: "",
                scope: "world",
            },
            {
                key: "count",
                type: Number,
                default: 0,
                scope: "world",
                range: {
                    min: 0,
                    max: 10,
                    step: 1,
                },
                onChange: () => {
                    renderCharacterSheets();
                },
            },
            {
                key: "trade",
                type: Boolean,
                default: true,
                scope: "world",
                onChange: () => {
                    renderCharacterSheets();
                },
            },
            {
                key: "private",
                type: Boolean,
                default: false,
                scope: "world",
            },
        ];
    }

    get api(): toolbelt.ToolbeltApi["heroActions"] {
        return {
            canTrade: this.canTrade.bind(this),
            discardHeroActions: this.discardHeroActions.bind(this),
            drawHeroActions: this.drawHeroActions.bind(this),
            getDeckTable: this.getDeckTable.bind(this),
            getHeroActionDetails: this.getHeroActionDetails.bind(this),
            getHeroActions: this.getHeroActions.bind(this),
            getHeroActionsTemplateData: this.getHeroActionsTemplateData.bind(this),
            giveHeroActions: this.giveHeroActions.bind(this),
            removeHeroActions: this.removeHeroActions.bind(this),
            sendActionToChat: this.sendActionToChat.bind(this),
            tradeHeroAction: this.tradeHeroAction.bind(this),
            useHeroAction: this.useHeroAction.bind(this),
            usesCountVariant: this.usesCountVariant.bind(this),
        };
    }

    _configurate(): void {
        const enabled = this.settings.enabled;

        toggleHooksAndWrappers(this.#hooks, enabled);
        this.#drawHeroActionsEmitable.toggle(enabled);

        if (enabled) {
            socketOn(this.#onSocket);
        } else {
            socketOff(this.#onSocket);
        }
    }

    ready(isGM: boolean): void {
        this._configurate();
    }

    getHeroActions(actor: CharacterPF2e): HeroActionsArray {
        return this.getDataFlagArray(actor, HeroActionModel, "actions");
    }

    canTrade(): boolean {
        return this.settings.trade;
    }

    usesCountVariant(): boolean {
        return this.settings.count > 0;
    }

    isValidActor(actor: unknown): actor is CharacterPF2e {
        if (actor instanceof Actor && (actor as ActorPF2e).isOfType("character")) return true;
        this.warning("error.onlyCharacter");
        return false;
    }

    getDefaultWorldTable(): RollTable | undefined {
        return game.tables.find((x) => x._stats.compendiumSource === HeroActionsTool.TABLE_UUID);
    }

    async getTableFromUuid(uuid: string): Promise<RollTable | undefined> {
        if (!uuid) return undefined;
        const table = await fromUuid(uuid);
        return table instanceof RollTable ? table : undefined;
    }

    async getDeckTable(): Promise<RollTable | undefined> {
        return (
            (await this.getTableFromUuid(this.settings.table)) ??
            this.getDefaultWorldTable() ??
            (await this.getTableFromUuid(HeroActionsTool.TABLE_UUID))
        );
    }

    async getHeroActionDetails(uuid: string) {
        const entry = await fromUuid<JournalEntry | JournalEntryPage<JournalEntry>>(uuid);

        if (!entry) {
            this.error("error.noDetails");
            return;
        }

        const parent = entry instanceof JournalEntry ? entry : entry.parent;
        const page = entry instanceof JournalEntry ? entry.pages.contents[0] : entry;

        let description = page?.text.content;

        if (!description) {
            this.error("error.noDetails");
            return;
        }

        if (parent.uuid === HeroActionsTool.JOURNAL_UUID) {
            const triggerLabel = this.localize("trigger");
            description = description.replace(/^<p>/, `<p><strong>${triggerLabel}</strong> `);
        }

        return { name: page.name, description };
    }

    getHeroActionsTemplateData(
        actor: CharacterPF2e
    ): toolbelt.heroActions.HeroActionsTemplateData<HeroActionsArray> | undefined {
        if (!this.isValidActor(actor)) return;

        const actions = this.getHeroActions(actor);
        const usesCount = this.usesCountVariant();
        const heroPoints = getMythicOrHeroPoints(actor).value;
        const diff = heroPoints - actions.length;
        const mustDiscard = !usesCount && diff < 0;
        const mustDraw = !usesCount && diff > 0;

        return {
            actions,
            usesCount,
            mustDiscard,
            mustDraw,
            canUse: (usesCount && heroPoints > 0) || diff >= 0,
            canTrade: actions.length && !mustDiscard && !mustDraw && this.canTrade(),
            diff: Math.abs(diff),
        };
    }

    async removeHeroActions(): Promise<void> {
        if (!game.user.isGM) {
            this.warning("error.notGM");
            return;
        }

        const onRender: DialogV2RenderCallback = (event, dialog) => {
            const html = dialog.element;
            const allInput = htmlQuery<HTMLInputElement>(html, "[name='all']")!;
            const actorInputs = htmlQueryAll<HTMLInputElement>(html, "[name='actor']");

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

        const result = await waitDialog<{ actor: (string | null)[] }>({
            classes: ["pf2e-toolbelt-heroActions-remove"],
            content: this.localizeKey("removeActions"),
            data: {
                actors: game.actors.filter((actor) => actor.isOfType("character")),
            },
            i18n: this.localizeKey("removeActions"),
            onRender,
            yes: {
                icon: "fa-solid fa-trash",
            },
        });

        if (!result) return;

        const updates = R.pipe(
            result.actor,
            R.map((id) => {
                if (!id) return;
                return this.setFlagProperty({ _id: id }, { actions: [] });
            }),
            R.filter(R.isTruthy)
        );

        if (!updates.length) return;

        getDocumentClass("Actor").updateDocuments(updates);
        this.info("removeActions.removed");
    }

    async giveHeroActions(actor: CharacterPF2e): Promise<void> {
        if (!game.user.isGM) {
            this.warning("error.notGM");
            return;
        }

        if (!this.isValidActor(actor)) return;

        const table = await this.getDeckTable();
        if (!table) {
            this.error("table.notFound", true);
            return;
        }

        const isUnique = table.replacement === false;
        const actions = this.getHeroActions(actor);

        const actionsList = await Promise.all(
            table.results.map(async (result) => {
                const uuid = documentUuidFromTableResult(result);
                if (!uuid || actions.find((x) => x.uuid === uuid)) return;

                const name = (await labelfromTableResult(result, uuid)) ?? "";

                return {
                    name,
                    drawn: isUnique && result.drawn,
                    uuid,
                    value: JSON.stringify({ uuid, name, key: result.id }),
                };
            })
        );

        const result = await waitDialog<{
            drawn: boolean;
            message: boolean;
            action: ({ key: string; uuid: DocumentUUID; name: string } | null)[];
        }>({
            classes: ["pf2e-toolbelt-heroActions-give"],
            content: this.localizeKey("giveActions"),
            data: {
                actions: R.sortBy(R.filter(actionsList, R.isTruthy), R.prop("name")),
                isUnique,
            },
            i18n: this.localizeKey("giveActions"),
            onRender: (event, dialog) => {
                addListenerAll(dialog.element, "[data-action='expand']", (el) => {
                    const target = htmlClosest(el, "[data-uuid]");
                    const uuid = target?.dataset.uuid;
                    if (!uuid) return;

                    this.#expandActionDescription(actor, uuid, target);
                });
            },
            position: {
                width: 600,
            },
            yes: {
                icon: "fa-solid fa-gift",
            },
        });

        if (!result) return;

        const selected = R.filter(result.action, R.isTruthy);
        if (!selected) return;

        const tableUpdates = [];

        for (const { uuid, name, key } of selected) {
            actions.push(new HeroActionModel({ name, uuid }));
            if (!result.drawn) continue;

            const entry = table.results.get(key);
            if (entry && !entry.drawn) {
                tableUpdates.push(key);
            }
        }

        if (tableUpdates.length) {
            table.updateEmbeddedDocuments(
                "TableResult",
                tableUpdates.map((key) => ({ _id: key, drawn: true }))
            );
        }

        actions.setFlag();

        if (result.message) {
            this.#createActionsMessage(actor, selected, "given");
        }
    }

    async drawHeroActions(actor: CharacterPF2e): Promise<void> {
        if (!this.isValidActor(actor)) return;

        const count = this.settings.count;
        const actions = this.getHeroActions(actor);
        const nb = count || getMythicOrHeroPoints(actor).value - actions.length;

        if (nb <= 0) {
            this.warning("error.notEnoughPoint");
            return;
        }

        if (count > 0) {
            actions.length = 0;
        }

        const table = await this.getDeckTable();

        if (!table) {
            this.error("table.notFound", true);
            return;
        }

        if ((!table.formula || table.replacement === false) && !table.isOwner) {
            this.#drawHeroActionsEmitable.emit({ actor, table });
        } else {
            this.#drawHeroActions({ actor, table }, game.userId);
        }
    }

    discardHeroActions(actor: CharacterPF2e, uuids: string[] | string) {
        if (!this.isValidActor(actor)) return;

        const actions = this.getHeroActions(actor);
        const removed: HeroActionModel[] = [];

        uuids = Array.isArray(uuids) ? uuids : [uuids];

        for (const uuid of uuids) {
            const action = actions.findSplice((x) => x.uuid === uuid);

            if (action) {
                removed.push(action);
            }
        }

        if (removed.length === 0) return;

        actions.setFlag();
        this.#createActionsMessage(actor, removed, "discarded");
    }

    async useHeroAction(actor: CharacterPF2e, uuid: string) {
        if (!this.isValidActor(actor)) return;

        const resource = getMythicOrHeroPoints(actor);
        const points = resource.value;
        if (points < 1) {
            this.warning("error.notEnoughPoint");
            return;
        }

        const actions = this.getHeroActions(actor);
        const index = actions.findIndex((x) => x.uuid === uuid);
        if (index === -1) return;

        actions.splice(index, 1);

        const details = await this.getHeroActionDetails(uuid);
        if (!details) return;

        const updates = this.setFlagProperty(
            { [`system.resources.${resource.name}.value`]: points - 1 },
            "actions",
            actions
        );

        actor.update(updates);

        const type = this.localize("message.used", resource.name);
        const flavorText = this.localize("message.used.message", { type });

        getDocumentClass("ChatMessage").create({
            flavor: `<h4 class="action">${flavorText}</h4>`,
            content: `<strong style="font-size: larger;">${details.name}</strong>${details.description}`,
            speaker: ChatMessage.getSpeaker({ actor }),
        });
    }

    async tradeHeroAction(actor: CharacterPF2e): Promise<void> {
        if (!this.isValidActor(actor)) return;

        const actions = this.getHeroActions(actor);

        if (!actions.length) {
            this.warning("error.noAction");
            return;
        }

        const heroPoints = getMythicOrHeroPoints(actor).value;
        const usesCount = this.usesCountVariant();

        if (!usesCount && heroPoints < actions.length) {
            this.warning("error.mustDiscard", { nb: actions.length - heroPoints });
            return;
        }

        const isPrivate = this.settings.private;
        const others: TradeActor[] = game.actors
            .map((other): TradeActor | undefined => {
                if (!other.isOfType("character") || other === actor || !other.hasPlayerOwner)
                    return;

                const otherActions = this.getHeroActions(other);
                if (!otherActions.length) return;

                return {
                    actions: otherActions,
                    id: other.id,
                    isPrivate: isPrivate && !other.isOwner,
                    name: other.name,
                };
            })
            .filter(R.isTruthy);

        if (others.length === 0) {
            this.warning("error.noOther");
            return;
        }

        const result = await TradeHeroAction.wait(actions, others, this);
        if (!result) return;

        const target = game.actors.get(result.target);
        if (!target?.isOfType("character")) return;

        const targetUser = primaryPlayerOwner(target) ?? game.users.activeGM;
        if (!targetUser) {
            ui.notifications.error(sharedLocalize("emiting.noGm"));
            return;
        }

        const data: TradeRequestOptions = {
            origin: {
                action: result.action,
                actor: actor.id,
                user: game.userId,
            },
            target: {
                action: result.targetAction,
                actor: target.id,
                user: targetUser.id,
            },
        };

        if (target.isOwner && data.target.action) {
            this.#exchangeActions(data as TradeExchangeOptions);
        } else {
            displayEmiting();
            socketEmit<SocketOptions>({
                type: "heroActions.request",
                ...data,
            });
        }
    }

    async sendActionToChat(actor: CharacterPF2e, uuid: string) {
        if (!this.isValidActor(actor)) return;

        const details = await this.getHeroActionDetails(uuid);
        if (!details) return;

        getDocumentClass("ChatMessage").create({
            content: `<strong style="font-size: larger;">${details.name}</strong>${details.description}`,
            speaker: ChatMessage.getSpeaker({ actor }),
        });
    }

    async #characterSheetPF2eRenderInner(
        sheet: CharacterSheetPF2e<CharacterPF2e>,
        wrapped: libWrapper.RegisterCallback,
        data: CharacterSheetData
    ) {
        const $html = await wrapped(data);
        const html = $html[0];
        const actor = sheet.actor;

        const template = await this.render("sheet", {
            ...this.getHeroActionsTemplateData(actor),
            isOwner: actor.isOwner,
            isGM: game.user.isGM,
        });

        const tab = htmlQuery(html, ".tab[data-tab=actions] .tab-content .tab[data-tab=encounter]");
        const attacks = htmlQuery(tab, ":scope > .strikes-list:not(.skill-action-list)");

        const sheetElement = createHTMLElement("div", { content: template });
        attacks?.after(...sheetElement.children);

        return $html;
    }

    #characterSheetPF2eActivateListeners(
        sheet: CharacterSheetPF2e<CharacterPF2e>,
        wrapped: libWrapper.RegisterCallback,
        $html: JQuery
    ) {
        wrapped($html);

        const html = $html[0];
        const tab = htmlQuery(html, ".tab[data-tab=actions] .tab-content .tab[data-tab=encounter]");
        const list = htmlQuery(tab, ".heroActions-list");
        if (!list || !tab) return;

        const actor = sheet.actor;

        addListenerAll(tab, "[data-hero-action]", (el) => {
            const action = el.dataset.heroAction as EventAction;
            const target = htmlClosest(el, "[data-uuid]");
            const uuid = target?.dataset.uuid ?? "";

            if (action === "give-actions") {
                this.giveHeroActions(actor);
            } else if (action === "action-chat") {
                this.sendActionToChat(actor, uuid);
            } else if (action === "action-discard") {
                this.#onDiscardAction(actor, uuid, target);
            } else if (action === "action-expand") {
                this.#expandActionDescription(actor, uuid, target);
            } else if (action === "action-use") {
                this.useHeroAction(actor, uuid);
            } else if (action === "actions-draw") {
                this.drawHeroActions(actor);
            } else if (action === "actions-trade") {
                this.tradeHeroAction(actor);
            }
        });
    }

    #exchangeActions({ origin, target }: TradeExchangeOptions) {
        const originActor = game.actors.get(origin.actor);
        const targetActor = game.actors.get(target.actor);
        if (!originActor?.isOfType("character") || !targetActor?.isOfType("character")) return;

        const originActions = this.getHeroActions(originActor);
        const targetActions = this.getHeroActions(targetActor);
        const originAction = originActions.findSplice((action) => action.uuid === origin.action);
        const targetAction = targetActions.findSplice((action) => action.uuid === target.action);
        if (!originAction || !targetAction) return;

        originActions.push(targetAction);
        targetActions.push(originAction);

        originActions.setFlag();
        targetActions.setFlag();

        this.#createActionsMessage(originActor, [originAction, targetAction], "exchanged", {
            senderId: origin.user,
            otherId: target.user,
            other: targetActor.name,
        });
    }

    async #expandActionDescription(actor: CharacterPF2e, uuid: string, target: Maybe<HTMLElement>) {
        const summary = htmlQuery(target, ".item-summary");
        if (!summary) return;

        if (!summary.classList.contains("loaded")) {
            const details = await this.getHeroActionDetails(uuid);
            if (!details) return;

            const textElement = createHTMLElement("div", {
                content: await foundry.applications.ux.TextEditor.implementation.enrichHTML(
                    details.description
                ),
            });

            htmlQuery(summary, ".item-description")?.append(textElement);
            summary.classList.add("loaded");
        }

        toggleSummary(summary);
    }

    async #drawHeroActions({ actor, table }: DrawHeroActionsOptions, userId: string) {
        if (
            !(actor instanceof Actor) ||
            !actor.isOfType("character") ||
            !(table instanceof RollTable)
        )
            return;

        const drawn: HeroActionFlag[] = [];
        const count = this.settings.count;
        const actions = this.getHeroActions(actor);
        const nb = count || getMythicOrHeroPoints(actor).value - actions.length;

        if (!table.formula) {
            if (table.compendium) {
                this.error("table.noFormulaCompendium", true);
                return;
            }
            await table.normalize();
        }

        for (let i = 0; i < nb; i++) {
            if (table.replacement === false) {
                const notDrawn = table.results.some((result) => !result.drawn);

                if (!notDrawn) {
                    await table.resetResults();
                }
            }

            const draw = (await table.draw({ displayChat: false })).results[0];

            if (!draw) {
                this.warning("table.noDraw", { name: actor.name });
                return;
            }

            const uuid = documentUuidFromTableResult(draw);

            if (!uuid) {
                this.warning("table.drawError");
                return;
            }

            const name = (await labelfromTableResult(draw, uuid)) ?? "";
            const action = new HeroActionModel({ uuid, name });

            if (action === undefined) continue;
            if (action === null) return;

            actions.push(action);
            drawn.push(action);
        }

        if (!drawn.length) return;

        actions.setFlag();
        this.#createActionsMessage(actor, drawn, "drawn");
    }

    #onDiscardAction(actor: CharacterPF2e, uuid: string, target: Maybe<HTMLElement>) {
        const parent = htmlClosest(target, ".actions-list");
        if (!target || !parent) return;

        const toDiscard = Number(parent.dataset.discard);
        const discarded = R.pipe(
            htmlQueryAll(parent, ".item.discarded"),
            R.map((x) => x.dataset.uuid),
            R.filter(R.isTruthy)
        );

        if (discarded.includes(uuid)) {
            target.classList.remove("discarded");
        } else if (discarded.length + 1 >= toDiscard) {
            discarded.push(uuid);
            this.discardHeroActions(actor, discarded);
        } else {
            target.classList.add("discarded");
        }
    }

    #createActionsMessage(
        actor: CharacterPF2e,
        actions: { uuid: DocumentUUID }[],
        type: "drawn" | "discarded" | "exchanged" | "given",
        {
            senderId = game.user.id,
            other,
            otherId,
        }: { senderId?: string; other?: string; otherId?: string } = {}
    ) {
        const links = actions.map(({ uuid }) => `@UUID[${uuid}]`);
        const flavor = this.localize("message", type, { nb: actions.length, name: other });

        const content =
            type === "exchanged"
                ? ["offer", "receive"].map((x, i) => {
                      return this.localize("message", x, { link: links[i] });
                  })
                : links;

        const data: PreCreate<ChatMessageSourcePF2e> = {
            flavor: `<h4 class="action">${flavor}</h4>`,
            content: content.map((x) => `<div>${x}</div>`).join(""),
            speaker: ChatMessage.getSpeaker({ actor }),
            author: senderId,
        };

        if (this.settings.private) {
            data.whisper = game.users
                .filter((user) => user.isGM)
                .map((user) => user.id)
                .concat(senderId);

            if (otherId) {
                data.whisper.push(otherId);
            }
        }

        getDocumentClass("ChatMessage").create(data);
    }

    async #tradeReject(options: TradeRejectOptions) {
        this.warning(
            "trade.rejected",
            {
                sender: game.actors.get(options.origin)?.name ?? options.origin,
                receiver: game.actors.get(options.target)?.name ?? options.target,
            },
            true
        );
    }

    async #tradeRequest(options: TradeRequestOptions) {
        const origin = game.actors.get(options.origin.actor);
        const target = game.actors.get(options.target.actor);
        if (!origin?.isOfType("character") || !target?.isOfType("character")) return;

        const targetActions = this.getHeroActions(target);
        const flavor = this.localize("trade.request.flavor", {
            sender: origin.name,
            receiver: target.name,
        });

        let content = `<div>${flavor}</div>`;

        if (!options.target.action) {
            const rows = targetActions.map(({ uuid, name }, i) => {
                const checked = i === 0 ? "checked" : "";
                return `<div class="action" data-uuid="${uuid}">
                    <input type="radio" name="action" value="${uuid}" ${checked} />
                    <a data-action="description"> ${name}</a>
                </div>`;
            });

            content += rows.join("");
        } else {
            const give = this.localize("trade.request.give", {
                give: `@UUID[${options.origin.action}]`,
            });
            const want = this.localize("trade.request.want", {
                want: `@UUID[${options.target.action}]`,
            });

            content += `<div>${give}</div><div>${want}</div>`;
        }

        const result = await waitDialog<{ action?: DocumentUUID }>({
            content: await foundry.applications.ux.TextEditor.implementation.enrichHTML(content),
            i18n: this.localizeKey("trade.request"),
            onRender: (event, dialog) => {
                addListenerAll(dialog.element, "[data-action='description']", async (el) => {
                    openDescriptionFromElement(el);
                });
            },
            yes: {
                icon: "fa-solid fa-handshake",
            },
        });

        const targetAction = options.target.action ?? (R.isPlainObject(result) && result.action);
        if (!result || !targetAction) {
            displayEmiting();
            return socketEmit<SocketOptions>({
                type: "heroActions.reject",
                origin: options.origin.actor,
                target: options.target.actor,
                user: options.origin.user,
            });
        }

        const data: TradeExchangeOptions = {
            origin: options.origin,
            target: {
                ...options.target,
                action: targetAction,
            },
        };

        if (origin.isOwner && target.isOwner) {
            this.#exchangeActions(data);
        } else {
            displayEmiting();
            socketEmit<SocketOptions>({
                type: "heroActions.exchange",
                ...data,
            });
        }
    }
}

async function labelfromTableResult(
    result: TableResult<RollTable>,
    uuid: string
): Promise<string | null | undefined> {
    if (result.type !== CONST.TABLE_RESULT_TYPES.TEXT) {
        return result.description;
    }

    const label = /@UUID\[[\w\.]+\]{([\w -]+)}/.exec(result.description)?.[1];
    return label ?? (uuid && (await fromUuid(uuid))?.name);
}

function documentUuidFromTableResult(result: TableResult<RollTable>): DocumentUUID | undefined {
    if (result.type === CONST.TABLE_RESULT_TYPES.TEXT) {
        return /@UUID\[([\w\.-]+)\]/.exec(result.description)?.[1] as DocumentUUID;
    }
    if (result.type === CONST.TABLE_RESULT_TYPES.DOCUMENT) {
        return `${result.documentCollection}.${result.documentId}` as DocumentUUID;
    }
    if (result.type === CONST.TABLE_RESULT_TYPES.COMPENDIUM) {
        return `Compendium.${result.documentCollection}.${result.documentId}` as DocumentUUID;
    }
    return undefined;
}

type EventAction =
    | "give-actions"
    | "action-chat"
    | "action-discard"
    | "action-expand"
    | "action-use"
    | "actions-draw"
    | "actions-trade";

type DrawHeroActionsOptions = {
    actor: CharacterPF2e;
    table: RollTable;
};

type SocketOptions =
    | BaseSocketOption<"heroActions.request", TradeRequestOptions>
    | BaseSocketOption<"heroActions.reject", TradeRejectOptions>
    | BaseSocketOption<"heroActions.exchange", TradeExchangeOptions>;

type BaseSocketOption<
    T extends string = string,
    D extends Record<string, any> = Record<string, any>
> = D & {
    type: T;
};

type TradeExchangeOptions = {
    origin: { action: DocumentUUID; actor: string; user: string };
    target: { action: DocumentUUID; actor: string; user: string };
};

type TradeRejectOptions = {
    origin: string;
    target: string;
    user: string;
};

type TradeRequestOptions = {
    origin: { action: DocumentUUID; actor: string; user: string };
    target: { action?: DocumentUUID; actor: string; user: string };
};

type HeroActionsSettings = {
    count: number;
    enabled: boolean;
    private: boolean;
    table: string;
    trade: boolean;
};

type HeroActionsArray = FlagDataArray<HeroActionModel, CharacterPF2e>;

type HeroActionFlag = toolbelt.heroActions.HeroAction;

type TradeActor = {
    actions: HeroActionsArray;
    id: string;
    isPrivate: boolean;
    name: string;
};

export { HeroActionsTool };
export type { HeroActionsArray, TradeActor };
