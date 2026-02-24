import { CharacterPF2e, htmlClosest, MODULE } from "foundry-helpers";
import {
    CharacterImport,
    CharacterImporterTool,
    getEntrySelection,
    getImportedEntry,
    ImportDataContextActionType,
    isCharacterCategory,
    isValidImportEntry,
    updateEntryOverride,
} from "..";

const ERROR_ACCESSING = "an error occured while accessing import data.";

async function onEntryAction(this: CharacterImporterTool, actor: CharacterPF2e, el: HTMLElement) {
    const data = await this.getImportData(actor);
    const dataset = htmlClosest(el, "[data-item-type]")?.dataset ?? {};
    const itemType = dataset.itemType;
    const index = dataset.index ? Number(dataset.index) : NaN;

    try {
        if (!data || !itemType || (itemType === "feat" && isNaN(index))) {
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

            case "entry-replace": {
                return onEntryReplace(actor, data, itemType, index);
            }

            case "entry-revert": {
                return updateEntryOverride.call(this, actor, itemType, null, index);
            }
        }
    } catch (error) {
        console.error(error);
    }
}

async function onEntryReplace(actor: CharacterPF2e, data: CharacterImport, itemType: string, index: number) {
    if (isCharacterCategory(itemType)) {
        return onEntryInstall(actor, data, itemType, index);
    }
}

async function onEntryRefresh(actor: CharacterPF2e, data: CharacterImport, itemType: string, index: number) {
    // const enabled = !item.system.rules.some(
    //     (r) => typeof r.key === "string" && ["ChoiceSet", "GrantItem"].includes(r.key),
    // );
    // if (enabled) item.refreshFromCompendium();
    // if (ImportDataModel.isCoreEntry(itemType)) {
    //     return onEntryInstall(actor, data, itemType, index);
    // }
}

async function onEntryInstall(actor: CharacterPF2e, data: CharacterImport, itemType: string, index: number) {
    if (!isValidImportEntry(itemType)) {
        throw MODULE.Error(ERROR_ACCESSING);
    }

    const entry = getImportedEntry(data, itemType, index);
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
