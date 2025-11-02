import {
    addListener,
    addListenerAll,
    CharacterPF2e,
    confirmDialog,
    createHTMLElement,
    htmlClosest,
    htmlQuery,
    MODULE,
    R,
} from "module-helpers";
import {
    EntryEventAction,
    importData,
    ImportMenuType,
    MENU_TYPES,
    onEntryAction,
    prepareContext,
} from ".";
import { CharacterImporterTool } from "..";

const SHEET_MENU_CLASS = "pf2e-toolbelt-character-importer";

async function createSheetContent(
    this: CharacterImporterTool,
    actor: CharacterPF2e,
    html: HTMLElement
) {
    removeSheetContent(html);

    const data = this.getImportData(actor);
    const context = data ? prepareContext.call(this, actor, data) : {};

    const content = createHTMLElement("div", {
        classes: [SHEET_MENU_CLASS],
        content: await this.render("sheet", context),
        dataset: {
            tooltipDirection: "UP",
        },
    });

    addEventListeners.call(this, content, actor);
    htmlQuery(html, ".sheet-body")?.appendChild(content);
}

function removeSheetContent(html: HTMLElement) {
    htmlQuery(html, `.${SHEET_MENU_CLASS}`)?.remove();
}

function addEventListeners(this: CharacterImporterTool, html: HTMLElement, actor: CharacterPF2e) {
    const selectTab = (type: ImportMenuType) => {
        const tabs = html.querySelectorAll<HTMLElement>("[data-tab]");

        for (const tab of tabs) {
            tab.classList.toggle("selected", tab.dataset.tab === type);
        }
    };

    {
        const inMemorytab = this.getInMemory<ImportMenuType>(actor, "tab");
        const selectedtab = R.isIncludedIn(inMemorytab, MENU_TYPES) ? inMemorytab : MENU_TYPES[0];
        selectTab(selectedtab);
    }

    addListenerAll(html, "[data-action]", async (el) => {
        const action = el.dataset.action as EventAction;

        if (action.startsWith("entry-")) {
            return onEntryAction.call(this, actor, el);
        }

        switch (action) {
            case "delete-data": {
                const confirm = await confirmDialog(this.localizeKey("deleteData"));
                return confirm && this.unsetFlag(actor, "data");
            }

            case "import-code": {
                return importData.call(this, actor, false);
            }

            case "import-file": {
                return importData.call(this, actor, true);
            }

            case "open-sheet": {
                const item = await fromUuid(el.dataset.itemUuid ?? "");
                return item?.sheet.render(true);
            }

            case "select-tab": {
                return selectTab(el.dataset.tab as ImportMenuType);
            }
        }
    });

    const onDrop = (_: HTMLElement, event: DragEvent) => {
        event.stopPropagation();
        event.preventDefault();

        const entry = htmlClosest(event.target, "[data-item-type]");
        if (!entry) return;

        try {
            const dataString = event.dataTransfer?.getData("text/plain");
            const dropData = JSON.parse(dataString ?? "");

            if (
                !R.isPlainObject(dropData) ||
                dropData.type !== "Item" ||
                !R.isString(dropData.uuid)
            ) {
                throw MODULE.Error("invalid data type.");
            }

            const itemType = R.isString(dropData.itemType)
                ? (dropData.itemType as string)
                : (fromUuidSync(dropData.uuid) as CompendiumIndexData | null)?.type;

            if (!itemType || itemType !== entry.dataset.itemType) {
                throw MODULE.Error("invalid item type.");
            }

            onEntryDrop.call(this, actor, entry.dataset, dropData.uuid as ItemUUID);
        } catch (error) {
            console.error(error);
        }
    };

    addListener(html, ".data", "drop", onDrop, true);
}

async function onEntryDrop(
    this: CharacterImporterTool,
    actor: CharacterPF2e,
    { itemType, index }: DOMStringMap,
    uuid: ItemUUID
) {
    const data = this.getImportData(actor);

    if (!data) {
        throw MODULE.Error("an error occured while processing import data.");
    }

    if (data.updateEntryOverride(itemType, uuid, Number(index))) {
        await data.setFlag();
    }
}

type EventAction =
    | EntryEventAction
    | "delete-data"
    | "import-code"
    | "import-file"
    | "open-sheet"
    | "select-tab";

export { createSheetContent, removeSheetContent };
