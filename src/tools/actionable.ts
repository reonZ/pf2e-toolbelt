import {
    AbilityItemPF2e,
    AbilitySheetPF2e,
    AbilityViewData,
    ActorPF2e,
    ActorSheetPF2e,
    addListenerAll,
    CastOptions,
    CharacterPF2e,
    CharacterSheetData,
    ChatMessagePF2e,
    ConsumablePF2e,
    ConsumableSheetPF2e,
    createHook,
    createHTMLElement,
    createHTMLElementContent,
    createToggleableWrapper,
    CreaturePF2e,
    EffectPF2e,
    EquipmentPF2e,
    EquipmentSheetPF2e,
    ErrorPF2e,
    FeatPF2e,
    FeatSheetPF2e,
    getActionGlyph,
    htmlQuery,
    isCastConsumable,
    isDefaultActionIcon,
    isScriptMacro,
    ItemPF2e,
    ItemSheetPF2e,
    MacroPF2e,
    MODULE,
    NPCPF2e,
    NPCSheetData,
    R,
    renderCharacterSheets,
    renderItemSheets,
    SpellcastingEntryPF2e,
    SpellPF2e,
    SpellSheetPF2e,
    toggleHooksAndWrappers,
    useAction,
    usePhysicalItem,
} from "module-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";

class ActionableTool extends ModuleTool<ToolSettings> {
    #renderCharacterSheetPF2eHook = createHook(
        [
            "renderCharacterSheetPF2e", //
            "renderNPCSheetPF2e",
        ],
        this.#onRenderSheetPF2e.bind(this)
    );

    #createChatMessageHook = createHook("createChatMessage", this.#onCreateChatMessage.bind(this));

    #actionWrappers = [
        createToggleableWrapper(
            "WRAPPER",
            [
                "CONFIG.Item.sheetClasses.action['pf2e.AbilitySheetPF2e'].cls.prototype._renderInner",
                "CONFIG.Item.sheetClasses.feat['pf2e.FeatSheetPF2e'].cls.prototype._renderInner",
            ],
            this.#actionSheetRenderInner,
            { context: this }
        ),
        createToggleableWrapper(
            "OVERRIDE",
            [
                "CONFIG.Item.sheetClasses.action['pf2e.AbilitySheetPF2e'].cls.prototype._onDrop",
                "CONFIG.Item.sheetClasses.feat['pf2e.FeatSheetPF2e'].cls.prototype._onDrop",
            ],
            this.#actionSheetPF2eOnDrop,
            { context: this }
        ),
    ];

    #itemWrappers = [
        createToggleableWrapper(
            "WRAPPER",
            [
                "CONFIG.Item.sheetClasses.consumable['pf2e.ConsumableSheetPF2e'].cls.prototype._renderInner",
                "CONFIG.Item.sheetClasses.equipment['pf2e.EquipmentSheetPF2e'].cls.prototype._renderInner",
            ],
            this.#itemSheetRenderInner,
            { context: this }
        ),
    ];

    #spellWrappers = [
        createToggleableWrapper(
            "WRAPPER",
            "CONFIG.Item.sheetClasses.spell['pf2e.SpellSheetPF2e'].cls.prototype._renderInner",
            this.#itemSheetRenderInner,
            { context: this }
        ),
        createToggleableWrapper(
            "MIXED",
            "CONFIG.PF2E.Item.documentClasses.spellcastingEntry.prototype.cast",
            this.#spellcastingEntryCast,
            { context: this }
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

    get api() {
        return {
            getActionMacro: this.getActionMacro.bind(this),
            getItemMacro: this.getItemMacro.bind(this),
        };
    }

    ready(): void {
        this._configurate(true);
        toggleHooksAndWrappers(this.#spellWrappers, this.settings.spell);
        this.#createChatMessageHook.toggle(this.settings.apply);
    }

    _configurate(skipRenders?: boolean): void {
        const actionEnabled = this.settings.action;
        const itemEnabled = this.settings.item;

        toggleHooksAndWrappers(this.#actionWrappers, actionEnabled);
        toggleHooksAndWrappers(this.#itemWrappers, itemEnabled);

        this.#renderCharacterSheetPF2eHook.toggle(
            actionEnabled || itemEnabled || this.settings.use
        );

        if (!skipRenders) {
            renderItemSheets([
                "AbilitySheetPF2e",
                "ConsumableSheetPF2e",
                "EquipmentSheetPF2e",
                "FeatSheetPF2e",
            ]);

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

    #onCreateChatMessage(origin: ChatMessagePF2e) {
        if (!origin.isAuthor || origin.getFlag("pf2e", "context.type") !== "self-effect") return;

        const hookId = Hooks.on(
            "renderChatMessageHTML",
            (message: ChatMessagePF2e, html: HTMLElement) => {
                if (message !== origin) return;

                Hooks.off("renderChatMessageHTML", hookId);

                // we wait for the message to actually be added to the DOM
                requestAnimationFrame(() => {
                    const btn = htmlQuery(html, `button[data-action="applyEffect"]`);
                    btn?.click();
                });
            }
        );
    }

    #onRenderSheetPF2e(
        sheet: ActorSheetPF2e<CharacterPF2e | NPCPF2e>,
        $html: JQuery,
        data: CharacterSheetData | NPCSheetData
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
        data: CharacterSheetData | NPCSheetData
    ) {
        if (!sheet.isEditable) return;

        const useConsumables = this.settings.use;
        const getItemMacro = this.settings.item ? this.getItemMacro.bind(this) : () => null;

        const items = R.pipe(
            data.inventory.sections,
            R.intersectionWith(["consumable", "equipment"], (section, type) => {
                return section.types.includes(type);
            }),
            R.flatMap((section) =>
                section.items.map(({ item }) => {
                    return item as EquipmentPF2e<ActorPF2e> | ConsumablePF2e<ActorPF2e>;
                })
            ),
            R.filter((item) => item.isIdentified)
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
                content: `<i class='fa-solid fa-play'></i>`,
                dataset: {
                    tooltip: "PF2E.Action.Use",
                },
                style: {
                    marginRight: "0.15rem",
                },
            });

            btn.addEventListener("click", (event) => {
                usePhysicalItem(event, item);
            });

            htmlQuery(el, ".item-controls")?.prepend(btn);
        });

        Promise.all(itemsPromise);
    }

    async #updateActorActions(
        sheet: ActorSheetPF2e<CharacterPF2e | NPCPF2e>,
        html: HTMLElement,
        data: CharacterSheetData | NPCSheetData
    ) {
        const actor = sheet.actor as CreaturePF2e;
        const isCharacter = actor.isOfType("character");
        const getActionMacro = this.settings.action ? this.getActionMacro.bind(this) : () => null;

        const actionGroups: Record<string, { actions: AbilityViewData[] }> =
            "encounter" in data.actions ? data.actions.encounter : R.pick(data.actions, ["active"]);
        const actions = R.pipe(
            actionGroups,
            R.values(),
            R.flatMap((group) => group.actions)
        );

        const useLabel = game.i18n.localize("PF2E.Action.Use");
        const panel = htmlQuery(
            html,
            isCharacter
                ? `.tab[data-tab="actions"] .tab-content .tab[data-tab="encounter"]`
                : `.tab[data-tab="main"] .actions.section-container .section-body`
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
        type: "action" | "item" | "spell"
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
        data: ItemSheetData<AbilityItemPF2e | FeatPF2e>
    ): Promise<JQuery> {
        const item = sheet.item;
        const $html: JQuery = await wrapped(data);

        if (this.isPassiveAction(item) || this.isCraftingAction(item)) {
            return $html;
        }

        const html = $html[0];
        const macro = await this.getActionMacro(item);
        const dropzone = htmlQuery(
            html,
            `.tab[data-tab="details"] .form-group[data-drop-zone="self-applied-effect"]`
        );

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
            droppedItem.category === "classfeature" &&
            droppedItem.sourceId &&
            droppedItem.sourceId !== sheetItem.sourceId
        ) {
            const feats = sheetItem._source.system.subfeatures?.suppressedFeatures ?? [];
            if (!feats.includes(droppedItem.sourceId)) {
                const newFeatures = [...feats, droppedItem.sourceId];
                await sheetItem.update({ "system.subfeatures.suppressedFeatures": newFeatures });
            }
            return;
        }

        throw ErrorPF2e("Invalid item drop");
    }

    async #itemSheetRenderInner(
        sheet: EquipmentSheetPF2e | ConsumableSheetPF2e | SpellSheetPF2e,
        wrapped: libWrapper.RegisterCallback,
        data: ItemSheetData<EquipmentPF2e | ConsumablePF2e | SpellPF2e>
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
            content: await this.#renderDropzone(
                sheet,
                macro,
                item.isOfType("spell") ? "spell" : "item"
            ),
        });

        tab?.prepend(dropzone);

        return $html;
    }

    async #spellcastingEntryCast(
        entry: SpellcastingEntryPF2e,
        wrapped: libWrapper.RegisterCallback,
        spell: SpellPF2e<ActorPF2e>,
        options: CastOptions = {}
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
                    return wrapped(
                        spell,
                        foundry.utils.mergeObject(options, macroOptions, { inplace: false })
                    );
                },
                cancel: () => {
                    return this.warning("spell.cancel", { name: spell.name });
                },
            });
        }

        wrapped(spell, options);
    }

    async #resolveDroppedItem(
        event: DragEvent,
        effectOnly: true
    ): Promise<Maybe<MacroPF2e | EffectPF2e>>;
    async #resolveDroppedItem(
        event: DragEvent,
        effectOnly: false
    ): Promise<Maybe<MacroPF2e | ItemPF2e>>;
    async #resolveDroppedItem(
        event: DragEvent,
        effectOnly: boolean
    ): Promise<Maybe<MacroPF2e | ItemPF2e>> {
        try {
            const dataString = event.dataTransfer?.getData("text/plain");
            const dropData = JSON.parse(dataString ?? "");
            if (typeof dropData !== "object") return;

            if (dropData.type === "Item") {
                const item = await getDocumentClass("Item").fromDropData(dropData);
                return !effectOnly || item?.isOfType("effect") ? item : null;
            }

            if (dropData.type === "Macro") {
                const macro = await getDocumentClass("Macro").fromDropData(dropData);
                return isScriptMacro(macro) ? macro : null;
            }
        } catch (err) {
            throw MODULE.Error(err);
        }
    }
}

type DropZoneData = {
    linked: Maybe<{
        img: Maybe<ImageFilePath>;
        name: string;
    }>;
};

type ToolSettings = toolbelt.Settings["actionable"];

export { ActionableTool };
