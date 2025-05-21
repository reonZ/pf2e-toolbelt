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
} from "module-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";

class ActionableTool extends ModuleTool<ToolSettings> {
    #renderCharacterSheetPF2eHook = createHook(
        "renderCharacterSheetPF2e",
        this.#onRenderCharacterSheetPF2e.bind(this)
    );

    #actionHooksAndWrappers = [
        createHook(
            ["renderFeatSheetPF2e", "renderAbilitySheetPF2e"],
            this.#onRenderActionSheetPF2e.bind(this)
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
        createHook("renderSpellSheetPF2e", this.#onRenderSpellSheetPF2e.bind(this)),
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
                onChange: (value) => {
                    this.configurate();
                },
            },
            {
                key: "spell",
                type: Boolean,
                default: false,
                scope: "world",
                onChange: (value) => {
                    this.configurate();
                },
            },
        ];
    }

    ready(): void {
        this._configurate();
    }

    _configurate(): void {
        const actionEnabled = this.settings.action;
        const spellEnabled = this.settings.spell;

        toggleHooksAndWrappers(this.#actionHooksAndWrappers, actionEnabled);
        toggleHooksAndWrappers(this.#spellHooksAndWrappers, spellEnabled);

        this.#renderCharacterSheetPF2eHook.toggle(actionEnabled);

        renderItemSheets(["FeatSheetPF2e", "AbilitySheetPF2e", "SpellSheetPF2e"]);
        renderCharacterSheets();
    }

    async getItemMacro(item: ItemPF2e): Promise<Maybe<MacroPF2e>> {
        const uuid = this.getFlag<string>(item, "macro");
        const macro = uuid ? await fromUuid<Macro>(uuid) : undefined;
        return isScriptMacro(macro) ? macro : undefined;
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

        if (this.settings.action) {
            this.#updateCharacterActions(sheet, html, data);
        }
    }

    async #updateCharacterActions(
        sheet: CharacterSheetPF2e<CharacterPF2e>,
        html: HTMLElement,
        data: CharacterSheetData
    ) {
        const isEditable = sheet.isEditable;
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

                const macro = await this.getItemMacro(item);
                if (!macro) return;

                const actionCost = item.actionCost;

                // we replace the action image if it is the default
                const imgEl = htmlQuery<HTMLImageElement>(el, ".item-image img");
                if (imgEl && macro.img && isDefaultActionIcon(actionImg, actionCost)) {
                    imgEl.src = macro.img;
                }

                const glyph = getActionGlyph(actionCost);
                const btn = createHTMLElement("button", {
                    classes: ["use-action"],
                    content: `<span>${useLabel}</span><span class="action-glyph">${glyph}</span>`,
                });

                // don't forget to make it a button to avoid form submition
                btn.type = "button";

                if (item.frequency) {
                    el.querySelector("button[data-action='use-action']")?.replaceWith(btn);
                } else {
                    el.querySelector(".button-group")?.append(btn);
                }

                if (isEditable) {
                    btn.addEventListener("click", async () => {
                        if (item.system.frequency && item.system.frequency.value > 0) {
                            const newValue = item.system.frequency.value - 1;
                            await item.update({ "system.frequency.value": newValue });
                        }
                        macro.execute({ actor: item.actor, item });
                    });
                }
            })
        );
    }

    async #onRenderSpellSheetPF2e(sheet: SpellSheetPF2e, $html: JQuery) {
        const html = $html[0];

        const macro = await this.getItemMacro(sheet.item);
        const tab = htmlQuery(html, `.tab[data-tab="details"]`);
        const dropzone = createHTMLElement("fieldset", {
            classes: ["macro"],
            content: await this.render<DropZoneData>("dropzone", {
                link: macro,
                i18n: "actionable.spellzone",
            }),
        });

        tab?.prepend(dropzone);

        if (macro) {
            this.#addDropzoneListeners(sheet, dropzone, macro);
        }

        if (sheet.isEditable) {
            dropzone.addEventListener("drop", async (event) => {
                const droppedItem = await this.#resolveDroppedItem(event);

                if (droppedItem instanceof Macro) {
                    return this.setFlag(sheet.item, "macro", droppedItem.uuid);
                }

                throw ErrorPF2e("Invalid item drop");
            });
        }
    }

    #addDropzoneListeners(sheet: ItemSheetPF2e<ItemPF2e>, dropzone: HTMLElement, macro: MacroPF2e) {
        addListenerAll(dropzone, "[data-action]", (el) => {
            switch (el.dataset.action as "open-link-sheet" | "delete-link") {
                case "open-link-sheet": {
                    return macro.sheet.render(true);
                }

                case "delete-link": {
                    return sheet.isEditable && this.unsetFlag(sheet.item, "macro");
                }
            }
        });
    }

    async #onRenderActionSheetPF2e(sheet: AbilitySheetPF2e | FeatSheetPF2e, $html: JQuery) {
        const item = sheet.item;
        if (!this.isValidAction(item)) return;

        const macro = await this.getItemMacro(item);
        const html = $html[0];
        const dropzone = htmlQuery(
            html,
            `.tab[data-tab="details"] .form-group[data-drop-zone="self-applied-effect"]`
        );

        if (!macro) {
            const label = htmlQuery(dropzone, "label");
            if (label) {
                label.innerText = this.localize("dropzone.label");
            }

            const hint = htmlQuery(dropzone, ".hint");
            if (hint) {
                hint.innerHTML = this.localize("dropzone.hint");
            }

            return;
        }

        const newDropzone = createHTMLElementContent({
            content: await this.render<DropZoneData>("dropzone", { link: macro }),
        });

        dropzone?.replaceWith(newDropzone);

        this.#addDropzoneListeners(sheet, newDropzone, macro);
    }

    async #spellcastingEntryCast(
        entry: SpellcastingEntryPF2e,
        wrapped: libWrapper.RegisterCallback,
        spell: SpellPF2e<ActorPF2e>,
        options: CastOptions = {}
    ) {
        const macro = await this.getItemMacro(spell);

        if (macro) {
            const value: any = await macro.execute({
                actor: spell.actor,
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
        }

        wrapped(spell, options);
    }

    async #actionSheetPF2eOnDrop(sheet: AbilitySheetPF2e | FeatSheetPF2e, event: DragEvent) {
        const sheetItem = sheet.item;
        if (!sheet.isEditable || !this.isValidAction(sheetItem)) return;

        const droppedItem = await this.#resolveDroppedItem(event);
        if (!droppedItem) return;

        if (droppedItem instanceof Macro) {
            return this.setFlag(sheetItem, "macro", droppedItem.uuid);
        }

        if (droppedItem.isOfType("effect")) {
            return sheetItem.update({
                "system.selfEffect": { uuid: droppedItem.uuid, name: droppedItem.name },
            });
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

    async #resolveDroppedItem(event: DragEvent): Promise<Maybe<MacroPF2e | ItemPF2e>> {
        try {
            const dataString = event.dataTransfer?.getData("text/plain");
            const dropData = JSON.parse(dataString ?? "");
            if (typeof dropData !== "object") return;

            if (dropData.type === "Item") {
                return getDocumentClass("Item").fromDropData(dropData);
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
    link: Maybe<{
        img: Maybe<ImageFilePath>;
        name: string;
    }>;
};

type ToolSettings = {
    action: boolean;
    spell: boolean;
};

type SpellMacroValue = {
    skipNotification?: boolean;
    customNotification?: string;
};

export { ActionableTool };
