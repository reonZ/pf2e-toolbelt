import { CharacterPF2e, FeatSlot, htmlClosest, MODULE, SpellPF2e } from "foundry-helpers";
import {
    CharacterImport,
    CharacterImporterTool,
    getCurrentItem,
    getEntrySelection,
    ImportDataContextActionType,
    ImportedContainerEntry,
    ImportedEntry,
    ImportedEquipmentEntry,
    ImportedFeatEntry,
    ImportedSpellEntry,
    ImportItemType,
    itemCanBeRefreshed,
} from "..";

const ERROR_ACCESSING = "an error occured while accessing import data.";

async function onEntryAction(this: CharacterImporterTool, actor: CharacterPF2e, el: HTMLElement) {
    try {
        const data = await this.getImportData(actor);
        const dataset = htmlClosest(el, "[data-item-type]")?.dataset ?? {};
        const itemType = dataset.itemType as ImportItemType;
        const index = dataset.index ? Number(dataset.index) : NaN;

        if (!data || !itemType) {
            throw MODULE.Error(ERROR_ACCESSING);
        }

        const action = el.dataset.action as EntryEventAction;

        switch (action) {
            case "entry-install": {
                return onEntryInstall(actor, data, itemType, index, dataset);
            }

            case "entry-refresh": {
                const item = actor.items.get(dataset.itemId ?? "");
                return item && itemCanBeRefreshed(item) && item.refreshFromCompendium();
            }

            case "entry-replace": {
                return onEntryInstall(actor, data, itemType, index, dataset);
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
    itemType: ImportItemType,
    index: number,
    dataset: { itemId?: string; parent?: string },
) {
    const entry = data.getImportedEntry(itemType, index);

    if (!entry) {
        throw MODULE.Error(ERROR_ACCESSING);
    }

    const item = getEntrySelection(entry);
    if (!item) {
        throw MODULE.Error("couldn't retrieve matching item.");
    }

    const source = item.toObject();
    source._id = foundry.utils.randomID();

    if (isSpellEntry(entry)) {
        const spellcasting = dataset.parent && actor.spellcasting.get(dataset.parent);
        if (!spellcasting) return;

        const current = getCurrentItem(actor, spellcasting?.spells, entry);

        if (current) {
            await actor.deleteEmbeddedDocuments("Item", [current.id], { render: false });
        }

        foundry.utils.setProperty(source, "system.location.value", spellcasting.id);

        if (entry.rank > (item as SpellPF2e).rank) {
            foundry.utils.setProperty(source, "system.location.heightenedLevel", entry.rank);
        }
    } else if (isFeatEntry(entry)) {
        if (entry.parent) return;

        const featSlot = !entry.extra && getFeatSlot(actor, entry);

        if (featSlot) {
            if (featSlot.feat) {
                await actor.deleteEmbeddedDocuments("Item", [featSlot.feat.id], { render: false });
            }

            foundry.utils.setProperty(source, "system.location", featSlot.id);
        }

        foundry.utils.setProperty(source, "system.level.taken", entry.level);
    } else if (isPhysicalEntry(entry)) {
        const current = dataset.itemId ? actor.items.get(dataset.itemId) : undefined;
        const currentContainerId = current?.isOfType("physical") ? current.system.containerId : null;
        const currentContents = (current?.isOfType("backpack") ? current.contents : []).map((item) => {
            return { _id: item.id, "system.containerId": source._id };
        });

        foundry.utils.setProperty(source, "system.quantity", entry.quantity);

        if (isContainerEntry(entry)) {
            source.name = entry.value;
        }

        if (currentContainerId) {
            foundry.utils.setProperty(source, "system.containerId", currentContainerId);
        }

        if (current) {
            await actor.deleteEmbeddedDocuments("Item", [current.id], { render: false });
        } else if (isEquipmentEntry(entry) && entry.container) {
            const parent = dataset.parent ? actor.items.get(dataset.parent) : undefined;

            if (parent) {
                foundry.utils.setProperty(source, "system.containerId", parent.id);
            }
        }

        if (currentContents.length) {
            await actor.updateEmbeddedDocuments("Item", currentContents, { render: false });
        }
    }

    await actor.createEmbeddedDocuments("Item", [source], { keepId: true });
}

function isSpellEntry(entry: ImportedEntry): entry is ImportedSpellEntry {
    return "rank" in entry || ("parent" in entry && entry.parent === "rituals");
}

function isFeatEntry(entry: ImportedEntry): entry is ImportedFeatEntry {
    return "category" in entry;
}

function isEquipmentEntry(entry: ImportedEntry): entry is ImportedEquipmentEntry {
    return "type" in entry;
}

function isContainerEntry(entry: ImportedEntry): entry is ImportedContainerEntry {
    return "identifier" in entry;
}

function isPhysicalEntry(entry: ImportedEntry): entry is ImportedEquipmentEntry | ImportedContainerEntry {
    return isEquipmentEntry(entry) || isContainerEntry(entry);
}

function getFeatSlot(actor: CharacterPF2e, entry: ImportedFeatEntry): FeatSlot | undefined {
    if (entry.parent) return;

    const slotId = `${entry.category}-${entry.level}`;
    const category = actor.feats.get(entry.category);

    return category?.feats.find((slot) => "id" in slot && slot.id === slotId) as FeatSlot | undefined;
}

type EntryEventAction = `entry-${ImportDataContextActionType}`;

export { getFeatSlot, isEquipmentEntry, isFeatEntry, onEntryAction };
export type { EntryEventAction };
