import { getItemSlug } from "module-helpers/src";
import {
    CharacterImporterTool,
    ImportDataCoreKey,
    ImportDataModel,
    ImportEntry,
    ImportFeatEntry,
} from ".";
import { CharacterPF2e, ItemPF2e, R } from "module-helpers";

const ACTION_ICONS = {
    install: "fa-solid fa-plus-large",
    refresh: "fa-solid fa-arrows-rotate",
    replace: "fa-solid fa-pen-to-square",
    revert: "fa-solid fa-xmark-large",
} as const;

function prepareContext(
    this: CharacterImporterTool,
    actor: CharacterPF2e,
    data: ImportDataModel
): ImportDataContext {
    const core: ImportDataEntry[] = data.coreEntries.map((itemType) => {
        return prepareCoreEntry.call(this, actor, data, itemType);
    });

    return {
        core,
    };
}

function prepareFeatEntry(
    this: CharacterImporterTool,
    actor: CharacterPF2e,
    data: ImportDataModel,
    entry: ImportFeatEntry,
    matchLevel: boolean
): ImportDataFeatEntry {
    const actorLevel = actor.level;
    const prepared = prepareEntry.call(this, "feat", entry, null);
    const uuid = prepared.selection?.uuid;
    const slug = prepared.selection ? getItemSlug(prepared.selection) : null;

    const current = actor.itemTypes.feat.find((feat) => {
        if (feat.sourceId !== uuid && getItemSlug(feat) !== slug) return false;

        const level = feat.system.level.taken ?? feat.system.level.value;
        return matchLevel ? level === actorLevel : level <= actorLevel;
    });

    // const children: ImportDataFeatEntry[] = R.pipe(
    //     data.feats,
    //     R.filter((feat) => feat.parent === itemType),
    //     R.map((feat) => prepareFeatEntry.call(this, actor, data, feat, false))
    // );

    return {
        ...prepareEntry.call(this, "feat", entry, current ?? null),
        level: entry.level,
        itemType: "feat",
    };
}

function prepareCoreEntry(
    this: CharacterImporterTool,
    actor: CharacterPF2e,
    data: ImportDataModel,
    itemType: ImportDataCoreKey
): ImportDataEntry {
    const entry = data[itemType];
    const current = actor[itemType];
    const prepared = prepareEntry.call(this, itemType, entry, current);

    prepared.children = R.pipe(
        data.feats,
        R.filter((feat) => feat.parent === itemType),
        R.map((feat) => prepareFeatEntry.call(this, actor, data, feat, false))
    );

    return prepared;
}

function prepareEntry(
    this: CharacterImporterTool,
    itemType: ImportDataCoreKey | "feat",
    entry: ImportEntry,
    current: ItemPF2e | null
): ImportDataEntry {
    const isOverride = !!entry.override;
    const uuid = entry.override ?? entry.match;
    const selection = uuid ? fromUuidSync<CompendiumIndexData>(uuid) : null;

    const matchLabel = this.localize("sheet.data.entry", isOverride ? "override" : "match");
    const actions: ImportDataContextAction[] = R.pipe(
        [
            isOverride ? "revert" : undefined,
            uuid && current ? "refresh" : undefined,
            uuid ? (current ? "" : "install") : undefined,
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
        selection,
        source: entry.value,
    };
}

type ImportDataContext = {
    core: ImportDataEntry[];
};

type ImportDataEntry = {
    actions: ImportDataContextAction[];
    children: ImportDataFeatEntry[];
    current: ItemPF2e | null;
    img: string;
    isOverride: boolean;
    itemType: ImportDataCoreKey | "feat";
    selection: CompendiumIndexData | null;
    source: string;
};

type ImportDataContextActionType = keyof typeof ACTION_ICONS;

type ImportDataContextAction = {
    type: ImportDataContextActionType;
    icon: string;
    label: string;
};

type ImportDataFeatEntry = Omit<ImportDataEntry, "itemType"> & {
    itemType: "feat";
    level: number;
};

export { prepareContext };
export type { ImportDataContextActionType };
