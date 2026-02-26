import {
    AbilityItemPF2e,
    AbilitySheetPF2e,
    AbilityViewData,
    ActionType,
    ActorPF2e,
    ActorRechargeData,
    ActorSheetOptions,
    ActorSheetPF2e,
    addListenerAll,
    CastOptions,
    CharacterPF2e,
    CharacterSheetData,
    CharacterSheetPF2e,
    ChatMessagePF2e,
    ConsumablePF2e,
    ConsumableSheetPF2e,
    createHTMLElement,
    createHTMLElementContent,
    createToggleHook,
    createToggleWrapper,
    CreaturePF2e,
    Duration,
    EffectPF2e,
    EquipmentPF2e,
    EquipmentSheetPF2e,
    ErrorPF2e,
    FeatPF2e,
    FeatSheetPF2e,
    getActionGlyph,
    getItemSourceId,
    htmlQuery,
    ImageFilePath,
    includesAny,
    InventoryItem,
    isCastConsumable,
    isDefaultActionIcon,
    isScriptMacro,
    ItemPF2e,
    ItemSheetDataPF2e,
    ItemSheetPF2e,
    itemWithActor,
    MacroPF2e,
    MODULE,
    NPCPF2e,
    NPCSheetData,
    PhysicalItemPF2e,
    R,
    registerWrapper,
    renderCharacterSheets,
    renderItemSheets,
    SpellcastingEntryPF2e,
    SpellPF2e,
    SpellSheetPF2e,
    SYSTEM,
    toggleHooksAndWrappers,
    toggleSummary,
    updateActionFrequency,
    useAction,
    usePhysicalItem,
} from "foundry-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";
import { sharedCharacterSheetActivateListeners } from "tools";
import {
    ActionableData,
    ActionableRuleElement,
    applyActorGroupUpdate,
    createActionableRuleElement,
    getActionSheetData,
    VirtualActionData,
} from ".";

class ActionableTool extends ModuleTool<ToolSettings> {
    #renderCharacterSheetPF2eHook = createToggleHook(
        ["renderCharacterSheetPF2e", "renderNPCSheetPF2e"],
        this.#onRenderSheetPF2e.bind(this),
    );

    #createChatMessageHook = createToggleHook("createChatMessage", this.#onCreateChatMessage.bind(this));

    #actionWrappers = [
        createToggleWrapper(
            "WRAPPER",
            [
                "CONFIG.Item.sheetClasses.action['pf2e.AbilitySheetPF2e'].cls.prototype._renderInner",
                "CONFIG.Item.sheetClasses.feat['pf2e.FeatSheetPF2e'].cls.prototype._renderInner",
            ],
            this.#actionSheetRenderInner,
            { context: this },
        ),
        createToggleWrapper(
            "OVERRIDE",
            [
                "CONFIG.Item.sheetClasses.action['pf2e.AbilitySheetPF2e'].cls.prototype._onDrop",
                "CONFIG.Item.sheetClasses.feat['pf2e.FeatSheetPF2e'].cls.prototype._onDrop",
            ],
            this.#actionSheetPF2eOnDrop,
            { context: this },
        ),
    ];

    #itemWrappers = [
        createToggleWrapper(
            "WRAPPER",
            [
                "CONFIG.Item.sheetClasses.consumable['pf2e.ConsumableSheetPF2e'].cls.prototype._renderInner",
                "CONFIG.Item.sheetClasses.equipment['pf2e.EquipmentSheetPF2e'].cls.prototype._renderInner",
            ],
            this.#itemSheetRenderInner,
            { context: this },
        ),
    ];

    #spellWrappers = [
        createToggleWrapper(
            "WRAPPER",
            "CONFIG.Item.sheetClasses.spell['pf2e.SpellSheetPF2e'].cls.prototype._renderInner",
            this.#itemSheetRenderInner,
            { context: this },
        ),
        createToggleWrapper(
            "MIXED",
            "CONFIG.PF2E.Item.documentClasses.spellcastingEntry.prototype.cast",
            this.#spellcastingEntryCast,
            { context: this },
        ),
    ];

    get key(): "actionable" {
        return "actionable";
    }

    get settingsSchema(): ToolSettingsList<ToolSettings> {
        return [
            {
                key: "action",
                type: Boolean,
                default: false,
                scope: "world",
                onChange: () => {
                    this.configurate();
                },
            },
            {
                key: "item",
                type: Boolean,
                default: false,
                scope: "world",
                onChange: () => {
                    this.configurate();
                },
            },
            {
                key: "spell",
                type: Boolean,
                default: false,
                scope: "world",
                onChange: (value) => {
                    toggleHooksAndWrappers(this.#spellWrappers, value);
                    renderItemSheets("SpellSheetPF2e");
                },
            },
            {
                key: "physical",
                type: Boolean,
                default: false,
                scope: "world",
                requiresReload: true,
            },
            {
                key: "use",
                type: Boolean,
                default: false,
                scope: "user",
                onChange: () => {
                    this.configurate();
                },
            },
            {
                key: "apply",
                type: Boolean,
                default: false,
                scope: "user",
                onChange: (value) => {
                    this.#createChatMessageHook.toggle(value);
                },
            },
        ];
    }

    get api(): toolbelt.Api["actionable"] {
        return {
            getActionMacro: this.getActionMacro.bind(this),
            getItemMacro: this.getItemMacro.bind(this),
            getVirtualAction: this.getVirtualAction.bind(this),
            getVirtualActionsData: this.getVirtualActionsData.bind(this),
            updateActionFrequency: (
                event: Event,
                item: AbilityItemPF2e<ActorPF2e> | FeatPF2e<ActorPF2e>,
                virtualData?: VirtualActionData,
            ) => {
                return updateActionFrequency(event, item, virtualData);
            },
            useAction: (
                event: Event,
                item: AbilityItemPF2e<ActorPF2e> | FeatPF2e<ActorPF2e>,
                virtualData?: VirtualActionData,
            ) => {
                return useAction(event, item, virtualData);
            },
        };
    }

    init() {
        if (!this.settings.physical) return;

        registerWrapper(
            "WRAPPER",
            "CONFIG.PF2E.Actor.documentClasses.character.prototype.prepareEmbeddedDocuments",
            this.#characterPrepareEmbeddedDocuments,
            this,
        );

        registerWrapper(
            "WRAPPER",
            "CONFIG.PF2E.Actor.documentClasses.character.prototype.recharge",
            this.#characterRecharge,
            this,
        );

        game.pf2e.RuleElements.custom.Actionable = createActionableRuleElement();
    }

    ready() {
        this._configurate(true);
        toggleHooksAndWrappers(this.#spellWrappers, this.settings.spell);
        this.#createChatMessageHook.toggle(this.settings.apply);

        if (this.settings.physical) {
            registerWrapper(
                "WRAPPER",
                "CONFIG.Actor.sheetClasses.character['pf2e.CharacterSheetPF2e'].cls.prototype.getData",
                this.#characterSheetGetData,
                this,
            );
            sharedCharacterSheetActivateListeners
                .register(this.#characterSheetActivateListeners, { context: this })
                .activate();
        }
    }

    _configurate(skipRenders?: boolean): void {
        const actionEnabled = this.settings.action;
        const itemEnabled = this.settings.item;

        toggleHooksAndWrappers(this.#actionWrappers, actionEnabled);
        toggleHooksAndWrappers(this.#itemWrappers, itemEnabled);

        this.#renderCharacterSheetPF2eHook.toggle(actionEnabled || itemEnabled || this.settings.use);

        if (!skipRenders) {
            renderItemSheets(["AbilitySheetPF2e", "ConsumableSheetPF2e", "EquipmentSheetPF2e", "FeatSheetPF2e"]);
            renderCharacterSheets();
        }
    }

    async getActionMacro(action: AbilityItemPF2e | FeatPF2e): Promise<Maybe<MacroPF2e>> {
        if (action.system.selfEffect || action.crafting) return;
        return this.getItemMacro(action);
    }

    async getItemMacro(action: ItemPF2e): Promise<Maybe<MacroPF2e>> {
        const uuid = this.getFlag<string>(action, "linked");
        const macro = uuid ? await fromUuid<MacroPF2e>(uuid) : undefined;
        return isScriptMacro(macro) ? macro : undefined;
    }

    isPassiveAction(item: AbilityItemPF2e | FeatPF2e): boolean {
        return item.system.actionType.value === "passive";
    }

    isCraftingAction(item: AbilityItemPF2e | FeatPF2e): boolean {
        return !!item.crafting;
    }

    getVirtualActionsData(actor: CharacterPF2e): Record<string, VirtualActionData> {
        return this.getInMemory(actor) ?? {};
    }

    async getVirtualAction(data: ActionableData): Promise<AbilityItemPF2e | null> {
        const action = await fromUuid<AbilityItemPF2e>(data.sourceId);
        if (!action?.actionCost || includesAny(action.system.traits.value, ["exploration", "downtime"])) return null;

        const cloneData: Record<string, any> = {
            _id: data.id,
        };

        if (!action.sourceId) {
            cloneData["_stats.duplicateSource"] = data.sourceId;
        }

        if (action.frequency && R.isNumber(data.frequency)) {
            cloneData["system.frequency.value"] = data.frequency;
        }

        return action.clone(cloneData, { keepId: true });
    }

    #characterPrepareEmbeddedDocuments(actor: CharacterPF2e, wrapped: libWrapper.RegisterCallback) {
        this.deleteInMemory(actor);
        wrapped();
    }

    /**
     * https://github.com/foundryvtt/pf2e/blob/e215ebfbb287190d313fe0441e0362439766786d/src/module/actor/base.ts#L531
     * modified to update the rule data
     */
    async #characterRecharge(
        actor: CharacterPF2e,
        wrapped: libWrapper.RegisterCallback,
        options: Parameters<CharacterPF2e["recharge"]>[0],
    ): Promise<ActorRechargeData> {
        const virtuals = this.getVirtualActionsData(actor);
        // we do that to we can make sure only a single update per type is ever done
        const originalCommit = options.commit;
        options.commit = false;

        const commitData: ActorRechargeData = await wrapped(options);

        const elapsed = options.duration;
        const specificDurations = ["turn", "round", "day"];

        await Promise.all(
            R.values(virtuals).map(async ({ data, parent, ruleIndex }) => {
                const frequency = (await this.getVirtualAction(data))?.frequency;
                if (!frequency || frequency.value >= frequency.max) return;

                const per = frequency.per;

                const specificPerIdx = specificDurations.indexOf(per);
                if (specificPerIdx >= 0 || elapsed === "day") {
                    const performUpdate =
                        specificPerIdx >= 0
                            ? specificDurations.indexOf(elapsed) >= specificPerIdx
                            : Duration.fromISO(per) <= Duration.fromISO("PT8H");
                    console.log(performUpdate);
                    if (performUpdate) {
                        const rule = parent.rules[ruleIndex] as ActionableRuleElement;
                        const update = rule.updateData({ frequency: frequency.max }, true);

                        if (update) {
                            commitData.itemUpdates.push(update);
                            commitData.affected.frequencies = true;
                        }
                    }
                }
            }),
        );

        // the original intent was to commit the updates, so we do it
        if (originalCommit !== false) {
            await applyActorGroupUpdate(actor, commitData);
        }

        return commitData;
    }

    async #characterSheetGetData(
        sheet: CharacterSheetPF2e<CharacterPF2e>,
        wrapped: libWrapper.RegisterCallback,
        options?: ActorSheetOptions,
    ): Promise<CharacterSheetData<CharacterPF2e>> {
        const virtuals = this.getVirtualActionsData(sheet.actor);
        const sheetData = (await wrapped(options)) as CharacterSheetData<CharacterPF2e>;
        const getActionMacro = this.settings.action ? this.getActionMacro.bind(this) : () => null;

        const addedTypes: Record<Exclude<ActionType, "passive">, boolean> = {
            action: false,
            free: false,
            reaction: false,
        };

        await Promise.all(
            R.values(virtuals).map(async ({ data }) => {
                const action = await this.getVirtualAction(data);
                if (!action) return;

                const type = action.actionCost?.type ?? "free";
                const macro = await getActionMacro(action);
                const actionData = getActionSheetData(action);

                if (macro?.img && isDefaultActionIcon(actionData.img, action.actionCost)) {
                    actionData.img = macro.img;
                }

                addedTypes[type] = true;
                sheetData.actions.encounter[type].actions.push(actionData);
            }),
        );

        for (const [type, added] of R.entries(addedTypes)) {
            if (!added) continue;
            sheetData.actions.encounter[type].actions.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
        }

        return sheetData;
    }

    async #characterSheetActivateListeners(sheet: CharacterSheetPF2e<CharacterPF2e>, html: HTMLElement) {
        const actor = sheet.actor;
        const virtuals = this.getVirtualActionsData(actor);

        const tab = htmlQuery(html, ".tab[data-tab=actions] .tab-content .tab[data-tab=encounter]");
        if (!tab) return;

        for (const virtualData of R.values(virtuals)) {
            const { data, parent } = virtualData;
            const action = await this.getVirtualAction(data);
            if (!action) return;

            const li = htmlQuery(html, `.item.action[data-item-id="${data.id}"]`);
            const controls = htmlQuery(li, ".item-controls");
            const summaryBtn = htmlQuery(li, `[data-action="toggle-summary"]`);
            const imageBtn = htmlQuery(li, `[data-action="item-to-chat"]`);
            const useBtn = htmlQuery(li, "button[data-action='use-action']");

            const lock = createHTMLElement("div", {
                content: `<i class="fa-solid fa-lock"></i>`,
                dataset: {
                    tooltip: `${this.localize("virtual")}<br>${parent.name}`,
                },
            });

            controls?.replaceChildren(lock);

            const addCaptureListener = <E extends HTMLElement, T extends keyof HTMLElementEventMap>(
                el: Maybe<E>,
                type: T,
                listener: (el: E, event: HTMLElementEventMap[T]) => any,
            ) => {
                el?.addEventListener(
                    type,
                    (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        listener(el, event);
                    },
                    { capture: true },
                );
            };

            addCaptureListener(summaryBtn, "click", async () => {
                const summary = htmlQuery(li, `.item-summary`);
                if (!summary) return;

                if (!summary.hasChildNodes()) {
                    const item = itemWithActor(actor, action);
                    const chatData = await item.getChatData({ secrets: item.isOwner });
                    await sheet.itemRenderer.renderItemSummary(summary, item, chatData);
                }

                toggleSummary(summary);
            });

            addCaptureListener(imageBtn, "click", (_el, event) => {
                const item = itemWithActor(actor, action);
                item.toMessage(event);
            });

            addCaptureListener(useBtn, "click", (_el, event) => {
                const item = itemWithActor<AbilityItemPF2e<CharacterPF2e>>(actor, action);
                useAction(event, item, virtualData);
            });

            const frequency = action.frequency;
            if (frequency) {
                const frequencyInput = htmlQuery<HTMLInputElement>(li, `[data-item-property="system.frequency.value"]`);

                addCaptureListener(frequencyInput, "change", async (_el, event) => {
                    await updateActionFrequency(event, action, virtualData);
                });
            }
        }
    }

    #onCreateChatMessage(origin: ChatMessagePF2e) {
        if (!origin.isAuthor || origin.flags[SYSTEM.id].context?.type !== "self-effect") return;

        const hookId = Hooks.on("renderChatMessageHTML", (message: ChatMessagePF2e, html: HTMLElement) => {
            if (message !== origin) return;

            Hooks.off("renderChatMessageHTML", hookId);

            // we wait for the message to actually be added to the DOM
            requestAnimationFrame(() => {
                const btn = htmlQuery(html, `button[data-action="applyEffect"]`);
                btn?.click();
            });
        });
    }

    #onRenderSheetPF2e(
        sheet: ActorSheetPF2e<CharacterPF2e | NPCPF2e>,
        $html: JQuery,
        data: CharacterSheetData | NPCSheetData,
    ) {
        if (!sheet.isEditable) return;

        const html = $html[0];

        if (this.settings.action) {
            this.#updateActorActions(sheet, html, data);
        }

        if (this.settings.use || this.settings.item) {
            this.#updateActorItems(sheet, html, data);
        }
    }

    async #updateActorItems(
        sheet: ActorSheetPF2e<CharacterPF2e | NPCPF2e>,
        html: HTMLElement,
        data: CharacterSheetData | NPCSheetData,
    ) {
        if (!sheet.isEditable) return;

        const useConsumables = this.settings.use;
        const getItemMacro = this.settings.item ? this.getItemMacro.bind(this) : () => null;

        const items = R.pipe(
            data.inventory.sections,
            R.intersectionWith(["consumable", "equipment", "backpack"], (section, type) => {
                return section.types.includes(type);
            }),
            R.flatMap((section) => getSectionItems(section.items)),
            R.filter((item): item is EquipmentPF2e<ActorPF2e> | ConsumablePF2e<ActorPF2e> => {
                return item.isOfType("equipment", "consumable") && item.isIdentified;
            }),
        );

        const panel = htmlQuery(html, `.tab[data-tab="inventory"] .inventory-pane`);

        const itemsPromise = items.map(async (item) => {
            const isConsumable = item.isOfType("consumable");
            const canUseMacro = !isConsumable || !isCastConsumable(item);
            const macro = canUseMacro && !!(await getItemMacro(item));
            const isUsable = useConsumables && isConsumable;
            if (!macro && !isUsable) return;

            const el = htmlQuery(panel, `[data-item-id="${item.id}"]`);
            if (!el) return;

            const btn = createHTMLElement("a", {
                classes: ["actionable-use"],
                content: `<i class='fa-solid fa-play'></i>`,
                dataset: {
                    tooltip: "PF2E.Action.Use",
                },
                style: {
                    marginRight: "0.15rem",
                },
            });

            if (isConsumable) {
                el.setAttribute("data-actionable-use", "true");
            }

            if (!item.quantity || (isConsumable && item.uses.value <= 0)) {
                btn.classList.add("disabled");
            } else {
                btn.addEventListener("click", (event) => {
                    usePhysicalItem(event, item);
                });
            }

            htmlQuery(el, ".item-controls")?.prepend(btn);
        });

        Promise.all(itemsPromise);
    }

    async #updateActorActions(
        sheet: ActorSheetPF2e<CharacterPF2e | NPCPF2e>,
        html: HTMLElement,
        data: CharacterSheetData | NPCSheetData,
    ) {
        const actor = sheet.actor as CreaturePF2e;
        const isCharacter = actor.isOfType("character");
        const getActionMacro = this.settings.action ? this.getActionMacro.bind(this) : () => null;

        const actionGroups: Record<string, { actions: AbilityViewData[] }> =
            "encounter" in data.actions ? data.actions.encounter : R.pick(data.actions, ["active"]);
        const actions = R.pipe(
            actionGroups,
            R.values(),
            R.flatMap((group) => group.actions),
        );

        const useLabel = game.i18n.localize("PF2E.Action.Use");
        const panel = htmlQuery(
            html,
            isCharacter
                ? `.tab[data-tab="actions"] .tab-content .tab[data-tab="encounter"]`
                : `.tab[data-tab="main"] .actions.section-container .section-body`,
        );

        const actionsPromise = actions.map(async ({ id: itemId, img: actionImg }) => {
            const item = actor.items.get(itemId);

            if (
                !item?.isOfType("action", "feat") ||
                this.isPassiveAction(item) ||
                this.isCraftingAction(item) ||
                item.system.selfEffect
            )
                return;

            const macro = await getActionMacro(item);
            if (!macro) return;

            const el = htmlQuery(panel, `.actions-list .action[data-item-id="${itemId}"]`);
            if (!el) return;

            const actionCost = item.actionCost;
            const glyph = getActionGlyph(actionCost);
            const existingBtn = htmlQuery(el, "button[data-action='use-action']");

            const btn = createHTMLElement("button", {
                classes: ["use-action"],
                content: `<span>${useLabel}</span><span class="action-glyph">${glyph}</span>`,
            });

            btn.addEventListener("click", (event) => {
                useAction(event, item);
            });

            if (existingBtn) {
                existingBtn.replaceWith(btn);
            } else if (macro && isCharacter) {
                htmlQuery(el, ".button-group")?.append(btn);
            } else if (macro) {
                const wrapper = createHTMLElement("div", {
                    classes: ["button-group"],
                    content: btn,
                });
                htmlQuery(el, ".controls")?.after(wrapper);
            }

            if (macro && isCharacter) {
                // we replace the action image if it is the default
                const imgEl = htmlQuery<HTMLImageElement>(el, ".item-image img");
                if (imgEl && macro.img && isDefaultActionIcon(actionImg, actionCost)) {
                    imgEl.src = macro.img;
                }
            }
        });

        Promise.all(actionsPromise);
    }

    async #renderDropzone(
        sheet: ItemSheetPF2e<ItemPF2e>,
        linked: Maybe<ItemPF2e | MacroPF2e>,
        type: "action" | "item" | "spell",
    ): Promise<HTMLElement> {
        const isEditable = sheet.isEditable;
        const dropzone = createHTMLElementContent({
            content: await this.render<DropZoneData>("dropzone", {
                linked,
                i18n: `${this.key}.${type}`,
            }),
        });

        addListenerAll(dropzone, "[data-action]", (el) => {
            const action = el.dataset.action as "open-link-sheet" | "delete-link";

            if (action === "delete-link") {
                isEditable && this.unsetFlag(sheet.item, "linked");
            } else if (action === "open-link-sheet") {
                linked?.sheet.render(true);
            }
        });

        if (type !== "action" && isEditable) {
            dropzone.addEventListener("drop", async (event) => {
                const droppedItem = await this.#resolveDroppedItem(event, true);

                if (droppedItem) {
                    return this.setFlag(sheet.item, "linked", droppedItem.uuid);
                }

                throw ErrorPF2e("Invalid item drop");
            });
        }

        return dropzone;
    }

    async #actionSheetRenderInner(
        sheet: AbilitySheetPF2e | FeatSheetPF2e,
        wrapped: libWrapper.RegisterCallback,
        data: ItemSheetDataPF2e<AbilityItemPF2e | FeatPF2e>,
    ): Promise<JQuery> {
        const item = sheet.item;
        const $html: JQuery = await wrapped(data);

        if (this.isPassiveAction(item) || this.isCraftingAction(item)) {
            return $html;
        }

        const html = $html[0];
        const macro = await this.getActionMacro(item);
        const dropzone = htmlQuery(html, `.tab[data-tab="details"] .form-group[data-drop-zone="self-applied-effect"]`);

        if (macro) {
            const newDropzone = createHTMLElementContent({
                content: await this.#renderDropzone(sheet, macro, "action"),
            });

            dropzone?.replaceWith(newDropzone);
        } else {
            const label = htmlQuery(dropzone, "label");
            if (label) {
                label.innerText = this.localize("action.label");
            }

            const hint = htmlQuery(dropzone, ".hint");
            if (hint) {
                hint.innerHTML = this.localize("action.hint");
            }
        }

        return $html;
    }

    async #actionSheetPF2eOnDrop(sheet: AbilitySheetPF2e | FeatSheetPF2e, event: DragEvent) {
        const sheetItem = sheet.item;
        if (!sheet.isEditable || this.isPassiveAction(sheetItem)) return;

        const droppedItem = await this.#resolveDroppedItem(event, false);
        if (!droppedItem) return;

        if (droppedItem instanceof Macro) {
            if (this.isCraftingAction(sheetItem)) {
                throw ErrorPF2e("Invalid item drop");
            }

            const updates = {
                "system.selfEffect": null,
            };

            this.setFlagProperty(updates, "linked", droppedItem.uuid);

            return sheetItem.update(updates);
        }

        if (droppedItem.isOfType("effect")) {
            const updates = {
                "system.selfEffect": { uuid: droppedItem.uuid, name: droppedItem.name },
            };

            this.setFlagProperty(updates, "-=macro", null);

            return sheetItem.update(updates);
        } else if (
            sheetItem.isOfType("feat") &&
            droppedItem.isOfType("feat") &&
            droppedItem.category === "classfeature"
        ) {
            const droppedSourceId = getItemSourceId(droppedItem);

            if (!droppedSourceId || droppedSourceId === getItemSourceId(sheetItem)) {
                throw ErrorPF2e("Invalid item drop");
            }

            const feats = sheetItem._source.system.subfeatures?.suppressedFeatures ?? [];
            if (!feats.includes(droppedSourceId)) {
                const newFeatures = [...feats, droppedSourceId];
                await sheetItem.update({ "system.subfeatures.suppressedFeatures": newFeatures });
            }

            return;
        }

        throw ErrorPF2e("Invalid item drop");
    }

    async #itemSheetRenderInner(
        sheet: EquipmentSheetPF2e | ConsumableSheetPF2e | SpellSheetPF2e,
        wrapped: libWrapper.RegisterCallback,
        data: ItemSheetDataPF2e<EquipmentPF2e | ConsumablePF2e | SpellPF2e>,
    ): Promise<JQuery> {
        const item = sheet.item;
        const $html: JQuery = await wrapped(data);

        if (item.isOfType("consumable") && ["wand", "scroll"].includes(item.category)) {
            return $html;
        }

        const html = $html[0];
        const macro = await this.getItemMacro(item);
        const tab = htmlQuery(html, `.tab[data-tab="details"]`);
        const dropzone = createHTMLElement("fieldset", {
            classes: ["linked"],
            content: await this.#renderDropzone(sheet, macro, item.isOfType("spell") ? "spell" : "item"),
        });

        tab?.prepend(dropzone);

        return $html;
    }

    async #spellcastingEntryCast(
        _entry: SpellcastingEntryPF2e,
        wrapped: libWrapper.RegisterCallback,
        spell: SpellPF2e<ActorPF2e>,
        options: CastOptions = {},
    ) {
        const actor = spell.actor;
        const macro = await this.getItemMacro(spell);

        if (macro) {
            // we let the macro handle the cast or cancelation of the spell
            return macro.execute({
                actor,
                spell,
                options,
                cast: (macroOptions: CastOptions = {}) => {
                    return wrapped(spell, foundry.utils.mergeObject(options, macroOptions, { inplace: false }));
                },
                cancel: () => {
                    return this.localize.warning("spell.cancel", { name: spell.name });
                },
            });
        }

        wrapped(spell, options);
    }

    async #resolveDroppedItem(event: DragEvent, effectOnly: true): Promise<Maybe<MacroPF2e | EffectPF2e>>;
    async #resolveDroppedItem(event: DragEvent, effectOnly: false): Promise<Maybe<MacroPF2e | ItemPF2e>>;
    async #resolveDroppedItem(event: DragEvent, effectOnly: boolean): Promise<Maybe<MacroPF2e | ItemPF2e>> {
        try {
            const dataString = event.dataTransfer?.getData("text/plain");
            const dropData = JSON.parse(dataString ?? "");

            if (typeof dropData !== "object") {
                throw new Error("invalid data type.");
            }

            if (dropData.type === "Item") {
                const item = await getDocumentClass("Item").fromDropData(dropData);
                return !effectOnly || item?.isOfType("effect") ? item : null;
            }

            if (dropData.type === "Macro") {
                const macro = await getDocumentClass("Macro").fromDropData(dropData);
                return isScriptMacro(macro) ? macro : null;
            }

            throw new Error("invalid data type.");
        } catch (err: any) {
            throw MODULE.error("an error occured while trying to resolve data drop", err);
        }
    }
}

function getSectionItems(items: InventoryItem<PhysicalItemPF2e>[]): PhysicalItemPF2e[] {
    return items.flatMap(({ item, heldItems }) => {
        return heldItems?.length ? [item, ...getSectionItems(heldItems)] : [item];
    });
}

const actionable = new ActionableTool();

type DropZoneData = {
    linked: Maybe<{
        img: Maybe<ImageFilePath>;
        name: string;
    }>;
};

type ToolSettings = toolbelt.Settings["actionable"];

export { actionable };
export type { ActionableTool };
