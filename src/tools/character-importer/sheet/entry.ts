import { CharacterPF2e, FlagData, htmlClosest, MODULE, R } from "module-helpers";
import { CharacterImporterTool, ImportDataContextActionType, ImportDataModel } from "..";

const ERROR_ACCESSING = "an error occured while accessing import data.";

function onEntryAction(this: CharacterImporterTool, actor: CharacterPF2e, el: HTMLElement) {
    const data = this.getImportData(actor);
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
                return onEntryRevert(data, itemType, index);
            }
        }
    } catch (error) {
        console.error(error);
    }
}

async function onEntryReplace(
    actor: CharacterPF2e,
    data: FlagData<ImportDataModel>,
    itemType: string,
    index: number
) {
    if (R.isIncludedIn(itemType, data.coreEntries)) {
        return onEntryInstall(actor, data, itemType, index);
    }
}

async function onEntryRefresh(
    actor: CharacterPF2e,
    data: FlagData<ImportDataModel>,
    itemType: string,
    index: number
) {
    // const enabled = !item.system.rules.some(
    //     (r) => typeof r.key === "string" && ["ChoiceSet", "GrantItem"].includes(r.key),
    // );
    // if (enabled) item.refreshFromCompendium();
    // if (R.isIncludedIn(itemType, data.coreEntries)) {
    //     return onEntryInstall(actor, data, itemType, index);
    // }
}

async function onEntryInstall(
    actor: CharacterPF2e,
    data: FlagData<ImportDataModel>,
    itemType: string,
    index: number
) {
    if (!R.isIncludedIn(itemType, data.entries)) {
        throw MODULE.Error(ERROR_ACCESSING);
    }

    const entry = itemType === "feats" ? data.feats.at(index) : data[itemType];

    if (!entry) {
        throw MODULE.Error(ERROR_ACCESSING);
    }

    const uuid = entry.override ?? entry.match;
    const item = uuid ? await fromUuid(uuid) : null;

    if (!item) {
        throw MODULE.Error("couldn't retrieve matching item.");
    }

    // TODO if this is a feat, we need to check if it is granted by anything

    await actor.createEmbeddedDocuments("Item", [item.toObject()]);
}

async function onEntryRevert(data: FlagData<ImportDataModel>, itemType: string, index: number) {
    if (data.updateEntryOverride(itemType, null, index)) {
        return await data.setFlag();
    }

    throw MODULE.Error(ERROR_ACCESSING);
}

type EntryEventAction = `entry-${ImportDataContextActionType}`;

export { onEntryAction };
export type { EntryEventAction };
