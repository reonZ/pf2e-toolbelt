import { CharacterPF2e, htmlClosest, MODULE } from "foundry-helpers";
import {
    CharacterImport,
    CharacterImporterTool,
    getEntrySelection,
    ImportDataContextActionType,
    ImportDataEntryKey,
    isCharacterCategory,
    isValidImportEntry,
    itemCanBeRefreshed,
} from "..";

const ERROR_ACCESSING = "an error occured while accessing import data.";

async function onEntryAction(this: CharacterImporterTool, actor: CharacterPF2e, el: HTMLElement) {
    try {
        const data = await this.getImportData(actor);
        const dataset = htmlClosest(el, "[data-item-type]")?.dataset ?? {};
        const itemType = dataset.itemType as ImportDataEntryKey;
        const index = dataset.index ? Number(dataset.index) : NaN;

        if (!data || !itemType || (itemType === "feat" && isNaN(index))) {
            throw MODULE.Error(ERROR_ACCESSING);
        }

        const action = el.dataset.action as EntryEventAction;

        switch (action) {
            case "entry-install": {
                return onEntryInstall(actor, data, itemType, index);
            }

            case "entry-refresh": {
                const item = actor.items.get(dataset.itemId ?? "");
                return item && itemCanBeRefreshed(item) && item.refreshFromCompendium();
            }

            case "entry-replace": {
                return isCharacterCategory(itemType) && onEntryInstall(actor, data, itemType, index);
            }

            case "entry-revert": {
                return data.updateEntryOverride(itemType, null, index) && this.setImportData(actor, data);
            }
        }
    } catch (error: any) {
        MODULE.error(error);
    }
}

async function onEntryInstall(
    actor: CharacterPF2e,
    data: CharacterImport,
    itemType: ImportDataEntryKey,
    index: number,
) {
    if (!isValidImportEntry(itemType)) {
        throw MODULE.Error(ERROR_ACCESSING);
    }

    const entry = data.getImportedEntry(itemType, index);
    if (!entry) {
        throw MODULE.Error(ERROR_ACCESSING);
    }

    const item = getEntrySelection(entry);
    if (!item) {
        throw MODULE.Error("couldn't retrieve matching item.");
    }

    // TODO if this is a feat, we need to check if it is granted by anything

    await actor.createEmbeddedDocuments("Item", [item.toObject()]);
}

type EntryEventAction = `entry-${ImportDataContextActionType}`;

export { onEntryAction };
export type { EntryEventAction };
