import { AttributeString, CharacterPF2e, ItemPF2e, R } from "module-helpers";
import {
    CharacterImporterTool,
    FeatEntryParent,
    AttributeLevel,
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
    return {
        core: prepareCoreTab.call(this, actor, data),
        hasData: true,
        menu: MENU,
    };
}

function prepareCoreTab(
    this: CharacterImporterTool,
    actor: CharacterPF2e,
    data: ImportDataModel
): ImportDataContext["core"] {
    const actorLevel = actor.level;
    const dataLevel = data.level;

    const cores: ImportDataEntry[] = ImportDataModel.coreEntries.map((itemType) => {
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
    });

    const attributes = R.pipe(
        data.attributes,
        R.entries(),
        R.filter(([level]) => Number(level) <= actorLevel),
        R.map(([level, boosts]): ImportDataAttribute => {
            return {
                level,
                boosts: ImportDataModel.attributeKeys.map((key) => {
                    if (!R.isIncludedIn(key, boosts)) return null;
                    return boostIsPartial(actor, key, Number(level)) ? "partial" : "boost";
                }),
            };
        })
    );

    const levelThreshold = Math.floor(actorLevel / 5);
    const warning =
        dataLevel >= actorLevel || Math.floor(dataLevel / 5) >= levelThreshold
            ? null
            : this.localize("sheet.data.core.attributes.warning", { level: levelThreshold * 5 });

    return {
        attributes,
        items: cores,
        warning,
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

/**
 * https://github.com/foundryvtt/pf2e/blob/a4049bd76dab59cb992e77b8c5c447d793940a85/src/module/actor/character/apps/attribute-builder.ts#L221
 */
function boostIsPartial(
    actor: CharacterPF2e,
    attribute: AttributeString,
    level: number,
    isApex: boolean = false
): boolean {
    const build = actor.system.build.attributes;

    if (level < 5 || build.manual || isApex) {
        return false;
    }
    const boosts = [
        build.boosts.ancestry.find((a) => a === attribute),
        build.boosts.background.find((a) => a === attribute),
        build.boosts.class === attribute ? attribute : null,
        build.boosts[1].find((a) => a === attribute),
        level === 20 ? build.boosts[20].find((a) => a === attribute) : null,
        level >= 15 ? build.boosts[15].find((a) => a === attribute) : null,
        level >= 10 ? build.boosts[10].find((a) => a === attribute) : null,
        level >= 5 ? build.boosts[5].find((a) => a === attribute) : null,
    ].filter(R.isTruthy).length;
    const flaws = Number(build.flaws.ancestry.some((a) => a === attribute));
    const netBoosts = boosts - flaws;

    const cssClasses: Record<number, boolean> = { 0: false, 1: true };
    return netBoosts >= 5 ? cssClasses[netBoosts % 2] : false;
}

type ImportDataContext = {
    core: {
        attributes: ImportDataAttribute[];
        items: ImportDataEntry[];
        warning: string | null;
    };
    hasData: true;
    menu: typeof MENU;
};

type ImportDataAttribute = {
    level: AttributeLevel;
    boosts: ("boost" | "partial" | null)[];
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
