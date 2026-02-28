import { CharacterPF2e, FeatSlot, getItemSlug, htmlClosest, ItemPF2e, MODULE, SYSTEM } from "foundry-helpers";
import {
    CharacterImport,
    CharacterImporterTool,
    getEntrySelection,
    ImportDataContextActionType,
    ImportDataEntryKey,
    ImportedFeatEntry,
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
                return onEntryInstall(actor, data, itemType, index);
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

    if ((entry as ImportedFeatEntry).parent) return;

    const item = getEntrySelection(entry);
    if (!item) {
        throw MODULE.Error("couldn't retrieve matching item.");
    }

    const source = item.toObject();

    // this is a feat
    if ("category" in entry) {
        const featSlot = getFeatSlot(actor, entry);

        if (featSlot) {
            if (featSlot.feat) {
                await actor.deleteEmbeddedDocuments("Item", [featSlot.feat.id]);
            }

            foundry.utils.setProperty(source, "system.location", featSlot.id);
        }

        foundry.utils.setProperty(source, "system.level.taken", entry.level);
    }

    await actor.createEmbeddedDocuments("Item", [source]);
}

function getCurrentFeat(actor: CharacterPF2e, entry: ImportedFeatEntry): ItemPF2e | null {
    const selection = getEntrySelection(entry);
    if (!selection) return null;

    const featSlot = getFeatSlot(actor, entry);
    if (featSlot) {
        return featSlot.feat ?? null;
    }

    const selectionUUID = selection.uuid;
    const selectionSlug = getItemSlug(selection);
    const sourceUUID = (selection !== entry.match && entry.match?.uuid) || null;
    const sourceSlug = sourceUUID ? SYSTEM.sluggify(entry.value) : null;

    const item = actor.itemTypes.feat.find((feat) => {
        const featSlug = getItemSlug(feat);

        if (feat.sourceId !== selectionUUID && featSlug !== selectionSlug) {
            if (!sourceUUID) return false;
            if (feat.sourceId !== sourceUUID && featSlug !== sourceSlug) return false;
        }

        return true;
    });

    return item ?? null;
}

function getFeatSlot(actor: CharacterPF2e, entry: ImportedFeatEntry): FeatSlot | undefined {
    if (entry.parent) return;

    const slotId = `${entry.category}-${entry.level}`;
    const category = actor.feats.get(entry.category);

    return category?.feats.find((slot) => "id" in slot && slot.id === slotId) as FeatSlot | undefined;
}

type EntryEventAction = `entry-${ImportDataContextActionType}`;

export { getCurrentFeat, getFeatSlot, onEntryAction };
export type { EntryEventAction };
