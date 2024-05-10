import {
    ErrorPF2e,
    addListener,
    addListenerAll,
    elementData,
    htmlElement,
    isInstanceOf,
    libWrapper,
    querySelector,
    renderCharacterSheets,
    renderItemSheets,
} from "pf2e-api";
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
    const actionElements = html.querySelectorAll(
        ".tab[data-tab='actions'] .actions-list:not(.heroActions-list):not(.strikes-list) .action[data-item-id]"
    );

    for (const actionElement of actionElements) {
        const { itemId } = elementData(actionElement);
        const item = actor.items.get(itemId);
        if (!item?.isOfType("feat", "action") || item.system.selfEffect) continue;

        const macro = await getActionMacro(item);
        if (!macro) continue;

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
            macro?.execute({ actor });

            if (!btn.dataset.skipMessage && !btn.dataset.toolbeltUse) {
                item.toMessage(event);
            }
        }
    );
}

async function getActionMacro(item: AbilityItemPF2e | FeatPF2e) {
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
    if (item.permission <= CONST.DOCUMENT_PERMISSION_LEVELS.LIMITED) return $html;

    const html = htmlElement($html);
    const label = localize("itemSheet.label");
    const group = querySelector(html, "[data-drop-zone='self-applied-effect']");
    const dropZone = group.querySelector(".drop-zone.empty");
    const macro = await getActionMacro(item);

    querySelector(group, ":scope > label").innerText += ` / ${label}`;
    querySelector(group, ".hint").innerText += localize("itemSheet.hint");

    if (!dropZone) return $html;

    if (macro) {
        dropZone.outerHTML = await render("dropzone", { macro });
    } else {
        querySelector(dropZone, ".name").innerText += ` / ${label}`;
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
    if (item.permission <= CONST.DOCUMENT_PERMISSION_LEVELS.LIMITED) return $html;

    const html = htmlElement($html);
    const group = querySelector(html, "[data-drop-zone='self-applied-effect']");

    addListener(group, "[data-action='open-macro-sheet']", async () => {
        const macro = await getActionMacro(item);
        macro?.sheet.render(true);
    });

    addListener(group, "[data-action='delete-macro']", () => {
        unsetFlag(item, "macro");
    });
}

async function actionSheetPF2eOnDrop(this: AbilitySheetPF2e | FeatSheetPF2e, event: DragEvent) {
    if (!this.isEditable) return;

    const doc = await (async (): Promise<Item | Macro | null> => {
        try {
            const dataString = event.dataTransfer?.getData("text/plain");
            const dropData = JSON.parse(dataString ?? "{}");
            if (typeof dropData !== "object") return null;

            if (dropData.type === "Item") {
                return (await Item.implementation.fromDropData(dropData)) ?? null;
            }

            if (dropData.type === "Macro") {
                return (await Macro.fromDropData(dropData)) ?? null;
            }

            return null;
        } catch {
            return null;
        }
    })();

    if (
        !(isInstanceOf<ItemPF2e>(doc, "ItemPF2e") && doc.isOfType("effect")) &&
        !(doc instanceof Macro)
    ) {
        throw ErrorPF2e("Invalid item drop");
    }

    const item = this.item;

    if (doc instanceof Item) {
        if (item.system.actionType.value === "passive") return;
        await item.update({ "system.selfEffect": { uuid: item.uuid, name: item.name } });
        return;
    }

    await setFlag(item, "macro", doc.uuid);
}

export { config as actionableTool, getActionMacro };
