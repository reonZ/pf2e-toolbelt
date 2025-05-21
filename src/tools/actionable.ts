import {
    AbilityItemPF2e,
    AbilitySheetPF2e,
    ActorPF2e,
    addListenerAll,
    CastOptions,
    CharacterPF2e,
    CharacterSheetData,
    CharacterSheetPF2e,
    createHook,
    createHTMLElement,
    createHTMLElementContent,
    createToggleableWrapper,
    EffectPF2e,
    ErrorPF2e,
    FeatPF2e,
    FeatSheetPF2e,
    getActionGlyph,
    htmlQuery,
    isDefaultActionIcon,
    isScriptMacro,
    ItemPF2e,
    ItemSheetPF2e,
    MacroPF2e,
    MODULE,
    R,
    renderCharacterSheets,
    renderItemSheets,
    SpellcastingEntryPF2e,
    SpellPF2e,
    SpellSheetPF2e,
    toggleHooksAndWrappers,
    useAction,
    useSelfAppliedAction,
} from "module-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";

class ActionableTool extends ModuleTool<ToolSettings> {
    #renderCharacterSheetPF2eHook = createHook(
        "renderCharacterSheetPF2e",
        this.#onRenderCharacterSheetPF2e.bind(this)
    );

    #actionHooksAndWrappers = [
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

    #spellHooksAndWrappers = [
        createToggleableWrapper(
            "WRAPPER",
            "CONFIG.Item.sheetClasses.spell['pf2e.SpellSheetPF2e'].cls.prototype._renderInner",
            this.#spellSheetRenderInner,
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
                key: "spell",
                type: Boolean,
                default: false,
                scope: "world",
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
                    this.configurate();
                },
            },
        ];
    }

    get api() {
        return {
            getActionMacro: this.getActionMacro.bind(this),
        };
    }

    ready(): void {
        this._configurate();
    }

    _configurate(): void {
        const actionEnabled = this.settings.action;
        const applyEnabled = this.settings.apply;
        const spellEnabled = this.settings.spell;

        toggleHooksAndWrappers(this.#actionHooksAndWrappers, actionEnabled);
        toggleHooksAndWrappers(this.#spellHooksAndWrappers, spellEnabled);

        this.#renderCharacterSheetPF2eHook.toggle(actionEnabled || applyEnabled);

        renderItemSheets(["FeatSheetPF2e", "AbilitySheetPF2e", "SpellSheetPF2e"]);
        renderCharacterSheets();
    }

    async getActionMacro(action: AbilityItemPF2e | FeatPF2e): Promise<Maybe<MacroPF2e>> {
        if (action.system.selfEffect || action.crafting) return;

        const uuid = this.getFlag<string>(action, "linked");
        const macro = uuid ? await fromUuid<MacroPF2e>(uuid) : undefined;

        return isScriptMacro(macro) ? macro : undefined;
    }

    async getItemLink(item: SpellPF2e): Promise<Maybe<MacroPF2e | EffectPF2e>> {
        const uuid = this.getFlag<string>(item, "linked");
        const linked = uuid ? await fromUuid<MacroPF2e | EffectPF2e>(uuid) : undefined;
        return isScriptMacro(linked) || (linked instanceof Item && linked.isOfType("effect"))
            ? linked
            : undefined;
    }

    isValidAction(item: AbilityItemPF2e | FeatPF2e): boolean {
        return item.system.actionType.value !== "passive";
    }

    #onRenderCharacterSheetPF2e(
        sheet: CharacterSheetPF2e<CharacterPF2e>,
        $html: JQuery,
        data: CharacterSheetData
    ) {
        if (!sheet.isEditable) return;

        const html = $html[0];

        if (this.settings.action || this.settings.apply) {
            this.#updateCharacterActions(sheet, html, data);
        }
    }

    async #updateCharacterActions(
        sheet: CharacterSheetPF2e<CharacterPF2e>,
        html: HTMLElement,
        data: CharacterSheetData
    ) {
        const isEditable = sheet.isEditable;
        const selfApply = isEditable && this.settings.apply;
        const getActionMacro = this.settings.action ? this.getActionMacro.bind(this) : () => null;
        const actor = sheet.actor;
        const actions = R.pipe(
            data.actions.encounter,
            R.values(),
            R.flatMap((group) => group.actions)
        );

        const useLabel = game.i18n.localize("PF2E.Action.Use");
        const panel = htmlQuery(
            html,
            `.tab[data-tab="actions"] .tab-content .tab[data-tab="encounter"]`
        );

        Promise.all(
            actions.map(async ({ id: itemId, img: actionImg }) => {
                const el = htmlQuery(panel, `.actions-list .action[data-item-id="${itemId}"]`);
                const item = actor.items.get(itemId);
                if (!el || !item?.isOfType("action", "feat") || !this.isValidAction(item)) return;

                const macro = await getActionMacro(item);
                if (!macro && (!selfApply || !item.system.selfEffect)) return;

                const actionCost = item.actionCost;
                const glyph = getActionGlyph(actionCost);
                const btn = createHTMLElement("button", {
                    classes: ["use-action"],
                    content: `<span>${useLabel}</span><span class="action-glyph">${glyph}</span>`,
                });

                btn.addEventListener("click", (event) => {
                    useAction(item, event);
                });

                const existingBtn = htmlQuery(el, "button[data-action='use-action']");
                if (existingBtn) {
                    existingBtn.replaceWith(btn);
                } else if (macro) {
                    htmlQuery(el, ".button-group")?.append(btn);
                }

                if (macro) {
                    // we replace the action image if it is the default
                    const imgEl = htmlQuery<HTMLImageElement>(el, ".item-image img");
                    if (imgEl && macro.img && isDefaultActionIcon(actionImg, actionCost)) {
                        imgEl.src = macro.img;
                    }
                }
            })
        );
    }

    async #renderDropzone(
        sheet: ItemSheetPF2e<ItemPF2e>,
        linked: Maybe<ItemPF2e | MacroPF2e>,
        withDrop: boolean
    ): Promise<HTMLElement> {
        const isEditable = sheet.isEditable;
        const dropzone = createHTMLElementContent({
            content: await this.render<DropZoneData>("dropzone", { linked }),
        });

        addListenerAll(dropzone, "[data-action]", (el) => {
            switch (el.dataset.action as "open-link-sheet" | "delete-link") {
                case "open-link-sheet": {
                    return linked?.sheet.render(true);
                }

                case "delete-link": {
                    return isEditable && this.unsetFlag(sheet.item, "linked");
                }
            }
        });

        if (withDrop && isEditable) {
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
        data: ActorSheetData<ActorPF2e>
    ): Promise<JQuery> {
        const item = sheet.item;
        const $html: JQuery = await wrapped(data);

        if (!this.isValidAction(item)) {
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
                content: await this.#renderDropzone(sheet, macro, false),
            });

            dropzone?.replaceWith(newDropzone);
        } else {
            const label = htmlQuery(dropzone, "label");
            if (label) {
                label.innerText = this.localize("dropzone.label");
            }

            const hint = htmlQuery(dropzone, ".hint");
            if (hint) {
                hint.innerHTML = this.localize("dropzone.hint");
            }
        }

        return $html;
    }

    async #actionSheetPF2eOnDrop(sheet: AbilitySheetPF2e | FeatSheetPF2e, event: DragEvent) {
        const sheetItem = sheet.item;
        if (!sheet.isEditable || !this.isValidAction(sheetItem)) return;

        const droppedItem = await this.#resolveDroppedItem(event, false);
        if (!droppedItem) return;

        if (droppedItem instanceof Macro) {
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

    async #spellSheetRenderInner(
        sheet: SpellSheetPF2e,
        wrapped: libWrapper.RegisterCallback,
        data: ActorSheetData<ActorPF2e>
    ): Promise<JQuery> {
        const $html: JQuery = await wrapped(data);

        const html = $html[0];
        const linked = await this.getItemLink(sheet.item);
        const tab = htmlQuery(html, `.tab[data-tab="details"]`);
        const dropzone = createHTMLElement("fieldset", {
            classes: ["linked"],
            content: await this.#renderDropzone(sheet, linked, true),
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
        const linked = await this.getItemLink(spell);

        if (linked instanceof Macro) {
            const value: any = await linked.execute({
                actor,
                item: spell,
                options,
            });

            if (value === false) {
                return this.warning("spell.cancel", { name: spell.name });
            } else if (R.isPlainObject<SpellMacroValue>(value)) {
                if (value.skipNotification) {
                    return;
                } else if (R.isString(value.customNotification)) {
                    return ui.notifications.warn(value.customNotification);
                }
            }
        } else if (linked) {
            await useSelfAppliedAction(spell, "roll", linked);
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

type ToolSettings = {
    action: boolean;
    spell: boolean;
    apply: boolean;
};

type SpellMacroValue = {
    skipNotification?: boolean;
    customNotification?: string;
};

export { ActionableTool };
