import {
    ErrorPF2e,
    addListener,
    addListenerAll,
    elementDataset,
    htmlQuery,
    libWrapper,
    renderCharacterSheets,
    renderItemSheets,
} from "foundry-pf2e";
import { createTool } from "../tool";
import {
    CHARACTER_SHEET_ACTIVATE_LISTENERS,
    CHARACTER_SHEET_RENDER_INNER,
} from "./shared/characterSheet";
import { createActionUseButton, getItemFromActionButton, useButtonToolSetting } from "./useButton";

const { config, settings, localize, wrappers, getFlag, setFlag, unsetFlag, render } = createTool({
    name: "actionable",
    settings: [
        {
            key: "enabled",
            type: Boolean,
            default: false,
            onChange: (value) => {
                wrappers.toggleAll(value);
                renderCharacterSheets();
                renderItemSheets(["AbilitySheetPF2e", "FeatSheetPF2e"]);
            },
        },
        {
            key: "message",
            type: Boolean,
            default: true,
            scope: "client",
            onChange: () => {
                renderCharacterSheets();
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
            callback: actionSheetPF2eRenderInner,
        },
        {
            path: "CONFIG.Item.sheetClasses.action['pf2e.AbilitySheetPF2e'].cls.prototype.activateListeners",
            callback: actionSheetPF2eActivateListeners,
        },
        {
            path: "CONFIG.Item.sheetClasses.action['pf2e.AbilitySheetPF2e'].cls.prototype._onDrop",
            callback: actionSheetPF2eOnDrop,
            type: "OVERRIDE",
        },
        {
            path: "CONFIG.Item.sheetClasses.feat['pf2e.FeatSheetPF2e'].cls.prototype._renderInner",
            callback: actionSheetPF2eRenderInner,
        },
        {
            path: "CONFIG.Item.sheetClasses.feat['pf2e.FeatSheetPF2e'].cls.prototype.activateListeners",
            callback: actionSheetPF2eActivateListeners,
        },
        {
            path: "CONFIG.Item.sheetClasses.feat['pf2e.FeatSheetPF2e'].cls.prototype._onDrop",
            callback: actionSheetPF2eOnDrop,
            type: "OVERRIDE",
        },
    ],
    ready: () => {
        wrappers.toggleAll(settings.enabled);
    },
} as const);

async function characterSheetPF2eRenderInner(this: CharacterSheetPF2e, html: HTMLElement) {
    const actor = this.actor;
    const useButton = useButtonToolSetting.actions;
    const withMessage = settings.message;
    const actionElements = html.querySelectorAll<HTMLElement>(
        ".tab[data-tab='actions'] .actions-list:not(.heroActions-list):not(.strikes-list) .action[data-item-id]"
    );

    for (const actionElement of actionElements) {
        const { itemId } = elementDataset(actionElement);
        const item = actor.items.get(itemId) as FeatPF2e | AbilityItemPF2e | undefined;
        const macro = await getActionMacro(item);
        if (!item || !macro) continue;

        const btn = createActionUseButton(item);
        btn.dataset.useActionMacro = "true";

        if (!withMessage) {
            btn.dataset.skipMessage = "true";
        }

        if (useButton && item.frequency) {
            if (item.frequency.value >= 1) {
                btn.dataset.toolbeltUse = "true";
            } else {
                btn.disabled = true;
            }
        }

        actionElement.querySelector(".button-group")?.append(btn);
    }
}

function characterSheetPF2eActivateListeners(this: CharacterSheetPF2e, html: HTMLElement) {
    const actor = this.actor;

    addListenerAll(
        html,
        ".use-action[data-use-action-macro='true']",
        async (event, btn: HTMLButtonElement) => {
            const item = getItemFromActionButton(actor, btn);
            if (!item?.isOfType("action", "feat")) return;

            const macro = await getActionMacro(item);
            macro?.execute({ actor, item });

            if (!btn.dataset.skipMessage && !btn.dataset.toolbeltUse) {
                item.toMessage(event);
            }
        }
    );
}

async function getActionMacro(item: Maybe<ItemPF2e>) {
    if (!item?.isOfType("feat", "action") || item.system.selfEffect) return null;

    const uuid = getFlag<string>(item, "macro");
    return uuid ? fromUuid<Macro>(uuid) : null;
}

async function actionSheetPF2eRenderInner(
    this: AbilitySheetPF2e | FeatSheetPF2e,
    wrapped: libWrapper.RegisterCallback,
    data: ActionSheetData | FeatSheetData
) {
    const $html = await wrapped(data);
    const item = this.item;
    if (
        item.system.actionType.value === "passive" ||
        item.permission <= CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED
    ) {
        return $html;
    }

    const html = $html[0];
    const label = localize("itemSheet.label");
    const group = htmlQuery(html, "[data-drop-zone='self-applied-effect']");
    if (!group) return $html;

    const labelEl = htmlQuery(group, ":scope > label");
    const hintEl = htmlQuery(group, ".hint");

    if (labelEl) labelEl.innerText += ` / ${label}`;
    if (hintEl) hintEl.innerText += localize("itemSheet.hint");

    const dropZone = group?.querySelector(".drop-zone.empty");
    if (!dropZone) return $html;

    const macro = await getActionMacro(item);

    if (macro) {
        dropZone.outerHTML = await render("dropzone", { macro });
    } else {
        const nameEl = htmlQuery(dropZone, ".name");
        if (nameEl) nameEl.innerText += ` / ${label}`;
    }

    return $html;
}

function actionSheetPF2eActivateListeners(
    this: AbilitySheetPF2e | FeatSheetPF2e,
    wrapped: libWrapper.RegisterCallback,
    $html: JQuery
) {
    wrapped($html);

    const item = this.item;
    if (
        item.system.actionType.value === "passive" ||
        item.permission <= CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED
    ) {
        return;
    }

    const html = $html[0];
    const group = htmlQuery(html, "[data-drop-zone='self-applied-effect']");
    if (!group) return;

    addListener(group, "[data-action='open-macro-sheet']", async () => {
        const macro = await getActionMacro(item);
        macro?.sheet.render(true);
    });

    addListener(group, "[data-action='delete-macro']", () => {
        unsetFlag(item, "macro");
    });
}

async function actionSheetPF2eOnDrop(this: AbilitySheetPF2e | FeatSheetPF2e, event: DragEvent) {
    if (!this.isEditable || this.item.system.actionType.value === "passive") {
        return;
    }

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

export { config as actionableTool, getActionMacro };
