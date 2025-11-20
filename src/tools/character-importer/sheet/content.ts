import {
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
    addCoreEventListeners,
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
    const context = await prepareContext.call(this, actor, data);

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
    {
        const { key, scroll } = this.getInMemory<InMemoryTab>(actor, "tab") ?? {};
        const isTabKey = R.isIncludedIn(key, MENU_TYPES);
        const tabKey = isTabKey ? key : MENU_TYPES[0];

        const nav = htmlQuery(html, `.menu .entry[data-tab="${tabKey}"]`);
        const tab = htmlQuery(html, `.data[data-tab="${tabKey}"]`);

        nav?.classList.add("selected");
        tab?.classList.add("selected");

        if (isTabKey && tab && R.isNumber(scroll) && scroll) {
            requestAnimationFrame(() => {
                tab.scrollTop = scroll;
            });
        }

        if (!isTabKey) {
            this.setInMemory<InMemoryTab>(actor, "tab", { key: tabKey });
        }
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
                const key = el.dataset.tab as ImportMenuType;
                const tabs = html.querySelectorAll<HTMLElement>("[data-tab]");

                for (const tab of tabs) {
                    tab.scrollTop = 0;
                    tab.classList.toggle("selected", tab.dataset.tab === key);
                }

                return this.setInMemory<InMemoryTab>(actor, "tab", { key });
            }
        }
    });

    const onScroll = (el: HTMLElement) => {
        const key = el.dataset.tab as ImportMenuType;

        if (this.getInMemory<ImportMenuType>(actor, "tab.key") === key) {
            this.setInMemory<number>(actor, "tab.scroll", el.scrollTop);
        }
    };

    addListenerAll(html, ".data[data-tab]", "scroll", foundry.utils.debounce(onScroll, 200));

    const onDrop = (_: HTMLElement, event: DragEvent) => {
        event.stopPropagation();
        event.preventDefault();

        const entry = htmlClosest(event.target, "[data-droppable][data-item-type]");
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

    addListenerAll(html, ".data", "drop", onDrop, true);

    addCoreEventListeners.call(this, html, actor);
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

type InMemoryTab = {
    key: ImportMenuType;
    scroll?: number;
};

export { createSheetContent, removeSheetContent };
