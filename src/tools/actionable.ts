import {
    AbilityItemPF2e,
    AbilitySheetPF2e,
    ActorPF2e,
    CastOptions,
    CharacterPF2e,
    CharacterSheetPF2e,
    ErrorPF2e,
    FeatPF2e,
    FeatSheetPF2e,
    ItemPF2e,
    R,
    SpellPF2e,
    SpellSheetPF2e,
    SpellcastingEntryPF2e,
    addListener,
    addListenerAll,
    createHTMLElement,
    elementDataset,
    getActionGlyph,
    htmlClosest,
    htmlQuery,
    htmlQueryAll,
    renderCharacterSheets,
    renderItemSheets,
    useAction,
} from "module-helpers";
import { createTool } from "../tool";
import {
    CHARACTER_SHEET_ACTIVATE_LISTENERS,
    CHARACTER_SHEET_RENDER_INNER,
} from "./shared/characterSheet";
import { getItemFromActionButton } from "./useButton";

const { config, settings, localize, wrappers, getFlag, setFlag, unsetFlag, render } = createTool({
    name: "actionable",
    settings: [
        {
            key: "enabled",
            type: Boolean,
            default: false,
            onChange: (value: boolean) => {
                wrappers.toggleAll(value);
                renderCharacterSheets();
                renderItemSheets(["AbilitySheetPF2e", "FeatSheetPF2e", "SpellSheetPF2E"]);
            },
        },
    ],
    api: {
        getActionMacro,
    },
    wrappers: [
        {
            path: CHARACTER_SHEET_RENDER_INNER,
            callback: characterSheetPF2eRenderInner,
        },
        {
            path: CHARACTER_SHEET_ACTIVATE_LISTENERS,
            callback: characterSheetPF2eActivateListeners,
        },
        {
            path: "CONFIG.Item.sheetClasses.action['pf2e.AbilitySheetPF2e'].cls.prototype._renderInner",
            callback: itemSheetPF2eRenderInner,
        },
        {
            path: "CONFIG.Item.sheetClasses.action['pf2e.AbilitySheetPF2e'].cls.prototype.activateListeners",
            callback: itemSheetPF2eActivateListeners,
        },
        {
            path: "CONFIG.Item.sheetClasses.action['pf2e.AbilitySheetPF2e'].cls.prototype._onDrop",
            callback: itemSheetPF2eOnDrop,
            type: "OVERRIDE",
        },
        {
            path: "CONFIG.Item.sheetClasses.feat['pf2e.FeatSheetPF2e'].cls.prototype._renderInner",
            callback: itemSheetPF2eRenderInner,
        },
        {
            path: "CONFIG.Item.sheetClasses.feat['pf2e.FeatSheetPF2e'].cls.prototype.activateListeners",
            callback: itemSheetPF2eActivateListeners,
        },
        {
            path: "CONFIG.Item.sheetClasses.feat['pf2e.FeatSheetPF2e'].cls.prototype._onDrop",
            callback: itemSheetPF2eOnDrop,
            type: "OVERRIDE",
        },
        {
            path: "CONFIG.Item.sheetClasses.spell['pf2e.SpellSheetPF2e'].cls.prototype._renderInner",
            callback: itemSheetPF2eRenderInner,
        },
        {
            path: "CONFIG.Item.sheetClasses.spell['pf2e.SpellSheetPF2e'].cls.prototype.activateListeners",
            callback: itemSheetPF2eActivateListeners,
        },
        {
            path: "CONFIG.PF2E.Item.documentClasses.spellcastingEntry.prototype.cast",
            callback: spellcastingEntryPF2eCast,
            type: "MIXED",
        },
    ],
    ready: () => {
        wrappers.toggleAll(settings.enabled);
    },
} as const);

async function characterSheetPF2eRenderInner(
    this: CharacterSheetPF2e<CharacterPF2e>,
    html: HTMLElement
) {
    const actor = this.actor;
    const useLabel = game.i18n.localize("PF2E.Action.Use");
    const actionElements = html.querySelectorAll<HTMLElement>(
        ".tab[data-tab='actions'] .actions-list:not(.heroActions-list):not(.strikes-list) .action[data-item-id]"
    );

    for (const actionElement of actionElements) {
        const { itemId } = elementDataset(actionElement);
        const item = actor.items.get(itemId) as FeatPF2e | AbilityItemPF2e | undefined;
        const macro = await getActionMacro(item);
        if (!item || !macro) continue;

        const actionIcon = getActionGlyph(item.actionCost);
        const btn = createHTMLElement("button", {
            classes: ["use-action"],
            dataset: { useActionMacro: "true" },
            innerHTML: `<span>${useLabel}</span><span class="action-glyph">${actionIcon}</span>`,
        });

        btn.type = "button";

        if (item.frequency) {
            actionElement.querySelector("[data-action='use-action']")?.replaceWith(btn);
        } else {
            actionElement.querySelector(".button-group")?.append(btn);
        }
    }
}

function characterSheetPF2eActivateListeners(
    this: CharacterSheetPF2e<CharacterPF2e>,
    html: HTMLElement
) {
    const actor = this.actor;

    addListenerAll(
        html,
        ".use-action[data-use-action-macro='true']",
        async (event, btn: HTMLButtonElement) => {
            const item = getItemFromActionButton(actor, btn);
            if (item) {
                useAction(item);
            }
        }
    );
}

async function itemSheetPF2eRenderInner(
    this: AbilitySheetPF2e | FeatSheetPF2e | SpellSheetPF2e,
    wrapped: libWrapper.RegisterCallback,
    data: ActionSheetData | ActorSheetData<ActorPF2e>
) {
    const $html = await wrapped(data);
    const item = this.item;
    if (item.permission <= CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED) {
        return $html;
    }

    const html = $html[0];
    const tab = htmlQuery(html, ".tab[data-tab='details']");
    if (!tab) return $html;

    const macro = await getActionMacro(item);

    if (item.isOfType("spell")) {
        const dropzone = macro ? await render("dropzone", { macro }) : null;
        const zone = await render("macro-zone", {
            dropzone,
            type: game.i18n.localize("TYPES.Item.spell").toLowerCase(),
        });

        tab.insertAdjacentHTML("afterbegin", `<fieldset class="macro">${zone}</fieldset>`);
    } else if (item.system.actionType.value === "passive") {
        const sibling = htmlQueryAll(tab, ".form-group").at(-1);
        if (!sibling) return $html;

        const dropzone = macro ? await render("dropzone", { macro }) : null;
        const zone = await render("macro-zone", {
            dropzone,
            type: game.i18n.localize("PF2E.ActionTypeAction").toLowerCase(),
        });

        sibling.insertAdjacentHTML("beforebegin", zone);
    } else {
        const label = localize("itemSheet.label");
        const group = htmlQuery(tab, "[data-drop-zone='self-applied-effect']");
        if (!group) return $html;

        const labelEl = htmlQuery(group, ":scope > label");
        const hintEl = htmlQuery(group, ".hint");

        if (labelEl) labelEl.innerText += ` / ${label}`;
        if (hintEl) hintEl.innerText += localize("itemSheet.hint");

        const dropZone = group?.querySelector(".drop-zone.empty");
        if (!dropZone) return $html;

        if (macro) {
            dropZone.outerHTML = await render("dropzone", { macro });
        } else {
            const nameEl = htmlQuery(dropZone, ".name");
            if (nameEl) nameEl.innerText += ` / ${label}`;
        }
    }

    return $html;
}

function itemSheetPF2eActivateListeners(
    this: AbilitySheetPF2e | FeatSheetPF2e | SpellSheetPF2e,
    wrapped: libWrapper.RegisterCallback,
    $html: JQuery
) {
    wrapped($html);

    const item = this.item;
    if (item.permission <= CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED) return;

    const html = $html[0];
    const tab = htmlQuery(html, ".tab[data-tab='details']");
    const group = htmlQuery(tab, "[data-drop-zone='self-applied-effect']");
    if (!group) return;

    addListener(group, "[data-action='open-macro-sheet']", async () => {
        const macro = await getActionMacro(item);
        macro?.sheet.render(true);
    });

    addListener(group, "[data-action='delete-macro']", () => {
        unsetFlag(item, "macro");
    });

    if (item.isOfType("spell")) {
        const fieldset = htmlClosest(group, "fieldset.macro");
        if (!fieldset) return;

        fieldset.addEventListener("drop", (event) => spellSheetPF2eOnDrop(event, item));
    }
}

async function spellSheetPF2eOnDrop(event: DragEvent, item: SpellPF2e) {
    try {
        const dataString = event.dataTransfer?.getData("text/plain");
        const dropData = JSON.parse(dataString ?? "");

        if (typeof dropData !== "object" || dropData.type !== "Macro") {
            throw new Error();
        }

        const macro = (await getDocumentClass("Macro").fromDropData(dropData)) ?? null;
        if (!macro) throw new Error();

        await setFlag(item, "macro", macro.uuid);
    } catch {
        throw ErrorPF2e("Invalid item drop");
    }
}

async function spellcastingEntryPF2eCast(
    this: SpellcastingEntryPF2e,
    wrapped: libWrapper.RegisterCallback,
    spell: SpellPF2e<ActorPF2e>,
    options: CastOptions = {}
): Promise<void> {
    const macro = await getActionMacro(spell);

    if (macro) {
        const value = (await macro.execute({
            actor: spell.actor,
            item: spell,
            options,
        })) as SpellMacroValue;

        if (value === false) {
            return localize.warn("cancelSpell", { name: spell.name });
        } else if (R.isObjectType<SpellMacroValue>(value)) {
            if (value.skipNotification) {
                return;
            } else if (typeof value.customNotification === "string") {
                ui.notifications.warn(value.customNotification);
                return;
            }
        }
    }

    wrapped(spell, options);
}

async function itemSheetPF2eOnDrop(this: AbilitySheetPF2e | FeatSheetPF2e, event: DragEvent) {
    if (!this.isEditable) return;

    const item = await (async (): Promise<ItemPF2e | Macro | null> => {
        try {
            const dataString = event.dataTransfer?.getData("text/plain");
            const dropData = JSON.parse(dataString ?? "");
            if (typeof dropData !== "object") return null;

            if (dropData.type === "Item") {
                return (await getDocumentClass("Item").fromDropData(dropData)) ?? null;
            }

            if (dropData.type === "Macro") {
                return (await getDocumentClass("Macro").fromDropData(dropData)) ?? null;
            }

            return null;
        } catch {
            return null;
        }
    })();

    if (item instanceof Item && item.isOfType("effect")) {
        await this.item.update({ "system.selfEffect": { uuid: item.uuid, name: item.name } });
    } else if (item instanceof Macro) {
        await setFlag(this.item, "macro", item.uuid);
    } else {
        throw ErrorPF2e("Invalid item drop");
    }
}

async function getActionMacro(item: Maybe<ItemPF2e>) {
    if (!item) return null;

    const isSpell = item.isOfType("spell");
    const isAction = item.isOfType("feat", "action");
    if (!isSpell && (!isAction || item.system.selfEffect || item.crafting)) return null;

    const uuid = getFlag<string>(item, "macro");
    return uuid ? fromUuid<Macro>(uuid) : null;
}

type SpellMacroValue = false | { skipNotification?: boolean; customNotification?: string };

export { config as actionableTool, getActionMacro };
