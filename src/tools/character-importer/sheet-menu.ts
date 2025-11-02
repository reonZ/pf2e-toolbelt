import {
    addListener,
    addListenerAll,
    CharacterPF2e,
    confirmDialog,
    createHTMLElement,
    FlagData,
    htmlClosest,
    htmlQuery,
    MODULE,
    R,
    waitDialog,
} from "module-helpers";
import {
    CharacterImporterTool,
    fromPathbuilder,
    ImportDataContextActionType,
    ImportDataModel,
    prepareContext,
} from ".";

const ERROR_ACCESSING = "an error occured while accessing import data.";
const SHEET_MENU_CLASS = "pf2e-toolbelt-character-importer";

async function createSheetMenu(
    this: CharacterImporterTool,
    actor: CharacterPF2e,
    html: HTMLElement
) {
    removeSheetMenu(html);

    const data = this.getImportData(actor);
    const context = data ? prepareContext.call(this, actor, data) : {};

    const menu = createHTMLElement("div", {
        classes: [SHEET_MENU_CLASS],
        content: await this.render("sheet", context),
        dataset: {
            tooltipDirection: "UP",
        },
    });

    addEventListeners.call(this, menu, actor);
    htmlQuery(html, ".sheet-body")?.appendChild(menu);
}

function removeSheetMenu(html: HTMLElement) {
    htmlQuery(html, `.${SHEET_MENU_CLASS}`)?.remove();
}

function addEventListeners(this: CharacterImporterTool, html: HTMLElement, actor: CharacterPF2e) {
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

            onEntryDrop.call(this, actor, itemType, dropData.uuid as ItemUUID);
        } catch (error) {
            console.error(error);
        }
    };

    addListener(html, ".data", "drop", onDrop, true);
}

function onEntryAction(this: CharacterImporterTool, actor: CharacterPF2e, el: HTMLElement) {
    const data = this.getImportData(actor);
    const { itemType, index } = htmlClosest(el, "[data-item-type]")?.dataset ?? {};

    try {
        if (!data || !itemType) {
            throw MODULE.Error(ERROR_ACCESSING);
        }

        const action = el.dataset.action as EntryEventAction;

        switch (action) {
            case "entry-install": {
                return onEntryInstall(actor, data, itemType, index);
            }

            case "entry-refresh": {
                return onEntryRefresh(actor, data, itemType, index);
            }

            case "entry-revert": {
                return onEntryRevert(data, itemType);
            }
        }
    } catch (error) {
        console.error(error);
    }
}

async function onEntryRefresh(
    actor: CharacterPF2e,
    data: FlagData<ImportDataModel>,
    itemType: string,
    index: unknown
) {
    if (R.isIncludedIn(itemType, data.coreEntries)) {
        return onEntryInstall(actor, data, itemType, index);
    }
}

async function onEntryInstall(
    actor: CharacterPF2e,
    data: FlagData<ImportDataModel>,
    itemType: string,
    index: unknown
) {
    if (!R.isIncludedIn(itemType, data.entries)) {
        throw MODULE.Error(ERROR_ACCESSING);
    }

    const entry = itemType === "feats" ? data.getFeat(index) : data[itemType];

    if (!entry) {
        throw MODULE.Error(ERROR_ACCESSING);
    }

    const uuid = entry.override ?? entry.match;
    const item = uuid ? await fromUuid(uuid) : null;

    if (!item) {
        throw MODULE.Error("couldn't retrieve matching item.");
    }

    await actor.createEmbeddedDocuments("Item", [item.toObject()]);
}

function onEntryRevert(data: FlagData<ImportDataModel>, itemType: string) {
    if (R.isIncludedIn(itemType, data.coreEntries)) {
        data.updateSource({ [`${itemType}.-=override`]: null });
        return data.setFlag();
    }

    throw MODULE.Error(ERROR_ACCESSING);
}

function onEntryDrop(
    this: CharacterImporterTool,
    actor: CharacterPF2e,
    itemType: string,
    uuid: ItemUUID
) {
    const data = this.getImportData(actor);

    if (!data) {
        throw MODULE.Error("an error occured while processing import data.");
    }

    if (R.isIncludedIn(itemType, data.coreEntries)) {
        if (data[itemType].match === uuid) {
            data.updateSource({ [`${itemType}.-=override`]: null });
        } else {
            data.updateSource({ [`${itemType}.override`]: uuid });
        }

        return data.setFlag();
    }
}

async function importData(this: CharacterImporterTool, actor: CharacterPF2e, fromFile: boolean) {
    const code = await (fromFile ? importFromFile : importFromJSON).call(this);
    if (!R.isString(code)) return;

    try {
        const parsed = JSON.parse(code) as unknown;
        const current = this.getImportData(actor)?.toObject ?? {};
        const data = new ImportDataModel(
            foundry.utils.mergeObject(current, await fromPathbuilder(parsed))
        );

        if (data.invalid) {
            throw MODULE.Error("an error occured when parsing pathbuilder JSON data.");
        }

        await this.setFlag(actor, "data", data);
    } catch (error) {
        console.error(error);
    }
}

async function importFromJSON(this: CharacterImporterTool): Promise<string | null> {
    const result = await waitDialog<{ code: string }>({
        i18n: this.localizeKey("import.code"),
        content: `<textarea name="code"></textarea>`,
        focus: "code",
    });

    return result ? result.code : null;
}

async function importFromFile(this: CharacterImporterTool): Promise<string | null> {
    const result = await waitDialog<{ file: File }>({
        i18n: this.localizeKey("import.file"),
        content: `<input type="file" name="file" accept=".json">`,
        focus: "code",
    });

    return result && result.file ? foundry.utils.readTextFromFile(result.file) : null;
}

type EntryEventAction = `entry-${ImportDataContextActionType}`;

type EventAction = EntryEventAction | "delete-data" | "import-code" | "import-file" | "open-sheet";

export { createSheetMenu, removeSheetMenu };
