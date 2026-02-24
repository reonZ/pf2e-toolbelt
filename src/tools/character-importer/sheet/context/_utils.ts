import { CharacterPF2e, FeatPF2e, getItemSlug, ItemPF2e, ItemUUID, R, SYSTEM } from "foundry-helpers";
import {
    CharacterCategory,
    CharacterImport,
    CharacterImporterTool,
    FeatEntryParent,
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
): ImportDataEntry {
    const isFeat = itemType === "feat";
    const isOverride = !!entry.override;
    const selection = getEntrySelection(entry);
    const matchLabel = this.localize("sheet.data.entry", isOverride ? "override" : "match");

    const label = game.i18n.localize(
        isFeat ? CONFIG.PF2E.featCategories[(entry as ImportedFeatEntry).category] : `TYPES.Item.${itemType}`,
    );

    const actions = R.pipe(
        [
            isOverride ? "revert" : undefined,
            selection && current ? (itemCanBeRefreshed(current) ? "refresh" : "locked") : undefined,
            selection ? (current ? "replace" : "install") : undefined,
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
    matchLevel: boolean,
): ImportDataFeatEntry {
    const current = getCurrentFeat(actor, entry, matchLevel);
    const prepared = prepareEntry.call(this, "feat", entry, current);

    // const children: ImportDataFeatEntry[] = R.pipe(
    //     data.feats,
    //     R.filter((feat) => feat.parent === itemType),
    //     R.map((feat) => prepareFeatEntry.call(this, actor, data, feat, false))
    // );

    return {
        ...prepared,
        index,
        itemType: "feat",
        level: entry.level,
        parent: entry.parent,
    };
}

function getCurrentFeat(actor: CharacterPF2e, entry: ImportedFeatEntry, matchLevel: boolean): ItemPF2e | null {
    const selection = getEntrySelection(entry);
    if (!selection) return null;

    const actorLevel = actor.level;
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

        const level = getItemLevel(feat);
        return matchLevel ? level === actorLevel : level <= actorLevel;
    });

    return item ?? null;
}

function getItemLevel(item: FeatPF2e): number;
function getItemLevel(item: ItemPF2e | null): number | undefined;
function getItemLevel(item: ItemPF2e | null) {
    if (!item) return;

    const { system } = item as { system: { level?: { taken?: number | null; value: number } } };
    return getItemLevel(item.grantedBy) ?? system.level?.taken ?? system.level?.value;
}

type ImportDataEntryKey = CharacterCategory | "feat";

type ImportDataEntry = {
    actions: ImportDataContextAction[];
    children: ImportDataFeatEntry[];
    current: ItemPF2e | null | undefined;
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

export { prepareEntry, prepareFeatEntry };
export type { ImportDataContextActionType, ImportDataEntry, ImportDataEntryKey };
