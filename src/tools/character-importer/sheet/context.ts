import { CharacterPF2e, ItemPF2e, R } from "module-helpers";
import {
    CharacterImporterTool,
    FeatEntryParent,
    ImportDataCoreKey,
    ImportDataEntryKey,
    ImportDataModel,
    ImportEntry,
    ImportFeatEntry,
    itemCanBeRefreshed,
} from "..";

const ACTION_ICONS = {
    install: "fa-solid fa-plus-large",
    locked: "fa-solid fa-lock",
    refresh: "fa-solid fa-arrows-rotate",
    replace: "fa-solid fa-arrow-right-arrow-left",
    revert: "fa-solid fa-xmark-large",
} as const;

const MENU = [
    { type: "core", icon: "fa-solid fa-address-card" },
    { type: "feats", icon: "fa-solid fa-medal" },
    { type: "inventory", icon: "fa-solid fa-box-open" },
    { type: "skills", icon: "fa-solid fa-hand" },
    { type: "spells", icon: "fa-solid fa-wand-magic-sparkles" },
    { type: "details", icon: "fa-solid fa-book-reader" },
] as const;

const MENU_TYPES = MENU.map(({ type }) => type);

function prepareContext(
    this: CharacterImporterTool,
    actor: CharacterPF2e,
    data: ImportDataModel
): ImportDataContext {
    const core: ImportDataEntry[] = ImportDataModel.coreEntries.map((itemType) => {
        return prepareCoreEntry.call(this, actor, data, itemType);
    });

    return {
        core,
        hasData: true,
        menu: MENU,
    };
}

function prepareFeatEntry(
    this: CharacterImporterTool,
    actor: CharacterPF2e,
    data: ImportDataModel,
    entry: ImportFeatEntry,
    index: number,
    matchLevel: boolean
): ImportDataFeatEntry {
    const current = data.getCurrentFeat(actor, entry, matchLevel);
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

function prepareCoreEntry(
    this: CharacterImporterTool,
    actor: CharacterPF2e,
    data: ImportDataModel,
    itemType: ImportDataCoreKey
): ImportDataEntry {
    const entry = data[itemType];
    const prepared = prepareEntry.call(this, itemType, entry, actor[itemType]);

    prepared.children = R.pipe(
        data.feats,
        R.map((feat, index) => {
            if (feat.parent !== itemType) return;
            return prepareFeatEntry.call(this, actor, data, feat, index, false);
        }),
        R.filter(R.isTruthy)
    );

    return prepared;
}

function prepareEntry(
    this: CharacterImporterTool,
    itemType: ImportDataEntryKey,
    entry: ImportEntry,
    current: ItemPF2e | null
): ImportDataEntry {
    const isFeat = itemType === "feat";
    const isOverride = !!entry.override;
    const selection = ImportDataModel.getSelection(entry);
    const uuid = selection?.uuid;
    const matchLabel = this.localize("sheet.data.entry", isOverride ? "override" : "match");

    const label = game.i18n.localize(
        isFeat
            ? CONFIG.PF2E.featCategories[(entry as ImportFeatEntry).category]
            : `TYPES.Item.${itemType}`
    );

    const actions = R.pipe(
        [
            isOverride ? "revert" : undefined,
            uuid && current ? (itemCanBeRefreshed(current) ? "refresh" : "locked") : undefined,
            uuid ? (current ? "replace" : "install") : undefined,
        ] as const,
        R.filter(R.isTruthy),
        R.map((type): ImportDataContextAction => {
            return {
                type,
                icon: ACTION_ICONS[type],
                label: this.localize("sheet.data.entry.action", type, { match: matchLabel }),
            };
        })
    );

    return {
        actions,
        children: [],
        current,
        img: selection?.img || `systems/pf2e/icons/default-icons/${itemType}.svg`,
        isOverride,
        itemType,
        label,
        selection,
        source: {
            label: entry.value,
            uuid: entry.match,
        },
    };
}

type ImportDataContext = {
    core: ImportDataEntry[];
    hasData: true;
    menu: typeof MENU;
};

type ImportDataEntry = {
    actions: ImportDataContextAction[];
    children: ImportDataFeatEntry[];
    current: ItemPF2e | null | undefined;
    img: string;
    isOverride: boolean;
    itemType: ImportDataEntryKey;
    label: string;
    selection: CompendiumIndexData | null;
    source: {
        label: string;
        uuid: ItemUUID | null;
    };
};

type ImportDataContextActionType = keyof typeof ACTION_ICONS;

type ImportDataContextAction = {
    type: ImportDataContextActionType;
    icon: string;
    label: string;
};

type ImportDataFeatEntry = Omit<ImportDataEntry, "itemType"> & {
    index: number;
    itemType: "feat";
    level: number;
    parent: FeatEntryParent | undefined;
};

type ImportMenuType = (typeof MENU)[number]["type"];

export { MENU_TYPES, prepareContext };
export type { ImportDataContextActionType, ImportMenuType };
