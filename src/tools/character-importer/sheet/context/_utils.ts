import { CharacterPF2e, FeatOrFeatureCategory, ItemPF2e, ItemUUID, R, stringNumber, SYSTEM } from "foundry-helpers";
import {
    CharacterCategory,
    CharacterImport,
    CharacterImporterTool,
    FeatEntryParent,
    getCurrentFeat,
    getEntrySelection,
    ImportedEntry,
    ImportedFeatEntry,
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
    itemType: ImportDataEntryKey,
    entry: ImportedEntry | ImportedFeatEntry,
    current: ItemPF2e | null,
    depth: number,
): ImportDataEntry {
    const isFeat = itemType === "feat";
    const isOverride = !!entry.override;
    const selection = getEntrySelection(entry);
    const matchLabel = this.localize("sheet.data.entry", isOverride ? "override" : "match");
    const category = isFeat ? (entry as ImportedFeatEntry).category : undefined;
    const label = game.i18n.localize(category ? CONFIG.PF2E.featCategories[category] : `TYPES.Item.${itemType}`);

    const actions = R.pipe(
        [
            isOverride ? "revert" : undefined,
            selection && current ? (itemCanBeRefreshed(current) ? "refresh" : "locked") : undefined,
            selection && !(entry as ImportedFeatEntry).parent ? (current ? "replace" : "install") : undefined,
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
        category,
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
    const current = getCurrentFeat(actor, entry);

    return {
        ...prepareEntry.call(this, "feat", entry, current, depth),
        children: prepareFeatEntries.call(this, actor, data, index, depth + 1),
        index,
        itemType: "feat",
        level: entry.level,
        parent: entry.parent,
    };
}

function prepareFeatEntries(
    this: CharacterImporterTool,
    actor: CharacterPF2e,
    data: CharacterImport,
    parent: CharacterCategory | number | undefined,
    depth: number,
    options: FeatOptions = {},
): ImportDataFeatEntry[] {
    const level = actor.level;
    const matchParent = R.isNumber(parent) ? stringNumber(parent) : parent;

    return R.pipe(
        data.feats,
        R.map((feat, index) => {
            if (feat.level > level || feat.parent !== matchParent || (!options.includeAwarded && feat.awarded)) return;
            return prepareFeatEntry.call(this, actor, data, feat, index, depth);
        }),
        R.filter(R.isTruthy),
    );
}

// function getItemLevel(item: FeatPF2e): number;
// function getItemLevel(item: ItemPF2e | null): number | undefined;
// function getItemLevel(item: ItemPF2e | null) {
//     if (!item) return;

//     const { system } = item as { system: { level?: { taken?: number | null; value: number } } };
//     return getItemLevel(item.grantedBy) ?? system.level?.taken ?? system.level?.value;
// }

type FeatOptions = {
    includeAwarded?: boolean;
    matchLevel?: boolean;
};

type ImportDataEntryKey = CharacterCategory | "feat";

type ImportDataEntry = {
    actions: ImportDataContextAction[];
    category: FeatOrFeatureCategory | undefined;
    children: ImportDataFeatEntry[];
    current: ItemPF2e | null | undefined;
    depth: number;
    img: string;
    isOverride: boolean;
    itemType: ImportDataEntryKey;
    label: string;
    selection: ItemPF2e | null;
    source: {
        label: string;
        uuid: Maybe<ItemUUID>;
    };
};

type ImportDataFeatEntry = Omit<ImportDataEntry, "itemType"> & {
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

export { prepareEntry, prepareFeatEntries };
export type { ImportDataContextActionType, ImportDataEntry, ImportDataEntryKey, ImportDataFeatEntry };
