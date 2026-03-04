import {
    CharacterPF2e,
    FeatOrFeatureCategory,
    FeatPF2e,
    getItemSlug,
    ItemPF2e,
    ItemType,
    ItemUUID,
    PhysicalItemPF2e,
    PhysicalItemType,
    R,
    SpellPF2e,
    stringNumber,
    SYSTEM,
} from "foundry-helpers";
import {
    CharacterCategory,
    CharacterImport,
    CharacterImporterTool,
    FeatEntryParent,
    getEntrySelection,
    getFeatSlot,
    ImportedContainerEntry,
    ImportedEntry,
    ImportedEquipmentEntry,
    ImportedFeatEntry,
    ImportItemType,
    isFeatEntry,
    itemCanBeRefreshed,
} from "tools";

const ACTION_ICONS = {
    install: "fa-solid fa-plus-large",
    locked: "fa-solid fa-lock",
    refresh: "fa-solid fa-arrows-rotate",
    replace: "fa-solid fa-arrow-right-arrow-left",
    revert: "fa-solid fa-xmark-large",
} as const;

function prepareEntry(
    this: CharacterImporterTool,
    itemType: ImportItemType,
    entry: ImportedEntry,
    current: ItemPF2e | null,
    depth: number,
    disabled?: boolean,
): ImportDataEntry {
    const isOverride = !!entry.override;
    const selection = getEntrySelection(entry);
    const matchLabel = this.localize("sheet.data.entry", isOverride ? "override" : "match");
    const label = game.i18n.localize(`TYPES.Item.${itemType}`);

    const actions = R.pipe(
        [
            isOverride ? "revert" : undefined,
            selection && current && !disabled ? (itemCanBeRefreshed(current) ? "refresh" : "locked") : undefined,
            selection && !depth && !disabled ? (current ? "replace" : "install") : undefined,
        ] as const,
        R.filter(R.isTruthy),
        R.map((type): ImportDataContextAction => {
            return {
                type,
                icon: ACTION_ICONS[type],
                label: this.localize("sheet.data.entry.action", type, { match: matchLabel }),
            };
        }),
    );

    return {
        actions,
        children: [],
        current,
        depth,
        img: selection?.img || SYSTEM.relativePath(`icons/default-icons/${itemType}.svg`),
        isOverride,
        itemType,
        label,
        selection,
        source: {
            label: entry.value,
            uuid: entry.match?.uuid,
        },
    };
}

function prepareFeatEntry(
    this: CharacterImporterTool,
    actor: CharacterPF2e,
    data: CharacterImport,
    entry: ImportedFeatEntry,
    index: number,
    depth: number,
): ImportDataFeatEntry {
    const current = getCurrentItem(actor, "feat", entry);

    return {
        ...prepareEntry.call(this, "feat", entry, current, depth),
        category: entry.category,
        children: prepareFeatEntries.call(this, actor, data, index, depth + 1),
        index,
        itemType: "feat",
        label: game.i18n.localize(CONFIG.PF2E.featCategories[entry.category]),
        level: !entry.parent || !R.isNumber(Number(entry.parent)) ? entry.level : 0,
        parent: entry.parent,
    };
}

function prepareFeatEntries(
    this: CharacterImporterTool,
    actor: CharacterPF2e,
    data: CharacterImport,
    parent: CharacterCategory | number | undefined,
    depth: number,
): ImportDataFeatEntry[] {
    const level = actor.level;
    const matchParent = R.isNumber(parent) ? stringNumber(parent) : parent;

    return R.pipe(
        data.feats,
        R.map((feat, index) => {
            if (feat.level > level || feat.parent !== matchParent || feat.awarded) return;
            return prepareFeatEntry.call(this, actor, data, feat, index, depth);
        }),
        R.filter(R.isTruthy),
    );
}

function getCurrentItem(
    actor: CharacterPF2e,
    itemType: PhysicalItemType,
    entry: ImportedContainerEntry | ImportedEquipmentEntry,
): PhysicalItemPF2e | null;
function getCurrentItem(actor: CharacterPF2e, itemType: "feat", entry: ImportedFeatEntry): FeatPF2e | null;
function getCurrentItem(
    actor: CharacterPF2e,
    itemType: ItemType,
    entry: ImportedContainerEntry | ImportedEquipmentEntry | ImportedFeatEntry,
): ItemPF2e | null {
    const selection = getEntrySelection(entry);
    if (!selection) return null;

    if (isFeatEntry(entry)) {
        const featSlot = getFeatSlot(actor, entry);
        if (featSlot) {
            return featSlot.feat ?? null;
        }
    }

    const selectionUUID = selection.uuid;
    const selectionSlug = getItemSlug(selection);
    const sourceUUID = (selection !== entry.match && entry.match?.uuid) || null;
    const sourceSlug = sourceUUID ? SYSTEM.sluggify(entry.value) : null;

    const item = actor.itemTypes[itemType].find((item) => {
        const featSlug = getItemSlug(item);

        if (item.sourceId !== selectionUUID && featSlug !== selectionSlug) {
            if (!sourceUUID) return false;
            if (item.sourceId !== sourceUUID && featSlug !== sourceSlug) return false;
        }

        return true;
    });

    return item ?? null;
}

// function getItemLevel(item: FeatPF2e): number;
// function getItemLevel(item: ItemPF2e | null): number | undefined;
// function getItemLevel(item: ItemPF2e | null) {
//     if (!item) return;

//     const { system } = item as { system: { level?: { taken?: number | null; value: number } } };
//     return getItemLevel(item.grantedBy) ?? system.level?.taken ?? system.level?.value;
// }

type ImportDataEntry = {
    actions: ImportDataContextAction[];
    children: ImportDataEntry[];
    current: ItemPF2e | null | undefined;
    depth: number;
    img: string;
    isOverride: boolean;
    itemType: ImportItemType;
    label: string;
    selection: ItemPF2e | null;
    source: {
        label: string;
        uuid: Maybe<ItemUUID>;
    };
};

type ImportDataFeatEntry = Omit<ImportDataEntry, "itemType"> & {
    category: FeatOrFeatureCategory;
    index: number;
    itemType: "feat";
    level: number;
    parent: FeatEntryParent | undefined;
};

type ImportDataContextAction = {
    type: ImportDataContextActionType;
    icon: string;
    label: string;
};

type ImportDataContextActionType = keyof typeof ACTION_ICONS;

export { getCurrentItem, prepareEntry, prepareFeatEntries, prepareFeatEntry };
export type { ImportDataContextActionType, ImportDataEntry, ImportDataFeatEntry };
