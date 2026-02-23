import {
    addListenerAll,
    AttributeString,
    CharacterPF2e,
    ClassPF2e,
    CompendiumIndexData,
    ItemPF2e,
    ItemUUID,
    R,
} from "foundry-helpers";
import { CharacterImporterTool } from "tools";

const ACTION_ICONS = {
    install: "fa-solid fa-plus-large",
    locked: "fa-solid fa-lock",
    refresh: "fa-solid fa-arrows-rotate",
    replace: "fa-solid fa-arrow-right-arrow-left",
    revert: "fa-solid fa-xmark-large",
} as const;

async function prepareCoreTab(
    this: CharacterImporterTool,
    actor: CharacterPF2e,
    data: ImportDataModel,
): Promise<ImportDataCoreContext> {
    const actorLevel = actor.level;
    const dataLevel = data.level;

    const entries: ImportDataEntry[] = ImportDataModel.coreEntries.map((itemType) => {
        const entry = data[itemType];
        const prepared = prepareEntry.call(this, itemType, entry, actor[itemType]);

        prepared.children = R.pipe(
            data.feats,
            R.map((feat, index) => {
                if (feat.parent !== itemType) return;
                return prepareFeatEntry.call(this, actor, data, feat, index, false);
            }),
            R.filter(R.isTruthy),
        );

        return prepared;
    });

    const attributesLevels = R.pipe(
        getLevelsAttributes(data, actor),
        R.map(({ level, boosts }): ImportDataBoostsEntry<"Boost" | "Partial"> => {
            return {
                label: game.i18n.format("PF2E.LevelN", { level }),
                boosts: R.map(ImportDataModel.attributeKeys, (key): ImportDataBoost<"Boost" | "Partial"> => {
                    const selected = R.isIncludedIn(key, boosts);
                    const type = selected && boostIsPartial(actor, key, Number(level)) ? "Partial" : "Boost";

                    return { locked: false, selected, type };
                }),
            };
        }),
    );

    const levelThreshold = Math.floor(actorLevel / 5);
    const warning =
        dataLevel >= actorLevel || Math.floor(dataLevel / 5) >= levelThreshold
            ? null
            : this.localize("sheet.data.core.attributes.warning", { level: levelThreshold * 5 });

    const attributesTotals = R.pipe(
        ImportDataModel.attributeKeys,
        R.map((key) => data.attributes.values[key] ?? 0),
    );

    const allAncestryBoosts = [...data.attributes.ancestry.boosts, ...data.attributes.ancestry.locked];
    const ancestryBoosts: ImportDataBoostsEntry<"Boost"> = {
        boosts: R.map(ImportDataModel.attributeKeys, (key): ImportDataBoost<"Boost"> => {
            return {
                locked: R.isIncludedIn(key, data.attributes.ancestry.locked),
                selected: R.isIncludedIn(key, allAncestryBoosts),
                type: "Boost",
            };
        }),
        label: game.i18n.localize("TYPES.Item.ancestry"),
    };

    const ancestryFlaws: ImportDataBoostsEntry<"Flaw"> | null = data.attributes.ancestry.flaws.length
        ? {
              label: "",
              boosts: R.map(ImportDataModel.attributeKeys, (key): ImportDataBoost<"Flaw"> | null => {
                  if (!R.isIncludedIn(key, data.attributes.ancestry.flaws)) return null;

                  return {
                      locked: true,
                      selected: true,
                      type: "Flaw",
                  };
              }),
          }
        : null;

    const backgroundBoosts: ImportDataBoostsEntry<"Boost"> = {
        boosts: R.map(ImportDataModel.attributeKeys, (key): ImportDataBoost<"Boost"> => {
            return {
                locked: false,
                selected: R.isIncludedIn(key, data.attributes.background),
                type: "Boost",
            };
        }),
        label: game.i18n.localize("TYPES.Item.background"),
    };
    const classUUID = entries.find((x) => x.itemType === "class")?.selection?.uuid;
    const classItem = classUUID ? await fromUuid<ClassPF2e>(classUUID) : null;
    const classKeys = classItem?.system.keyAbility.value ?? data.attributes.class;
    const classBoosts: ImportDataBoostsEntry<"KeyIcon"> = {
        boosts: R.map(ImportDataModel.attributeKeys, (key): ImportDataBoost<"KeyIcon"> | null => {
            if (!R.isIncludedIn(key, classKeys)) return null;

            return {
                locked: false,
                selected: R.isIncludedIn(key, data.attributes.class),
                type: "KeyIcon",
            };
        }),
        label: game.i18n.localize("TYPES.Item.class"),
    };

    return {
        attributes: {
            ancestry: {
                boosts: ancestryBoosts,
                flaws: ancestryFlaws,
            },
            background: backgroundBoosts,
            class: classBoosts,
            labels: ImportDataModel.attributeKeys,
            levels: attributesLevels,
            totals: attributesTotals,
        },
        classItem,
        entries,
        warning,
    };
}

function addCoreEventListeners(this: CharacterImporterTool, html: HTMLElement, actor: CharacterPF2e) {
    addListenerAll(html, "[data-action]", (el) => {
        const action = el.dataset.action as EventAction;

        switch (action) {
            case "assign-attributes": {
                return assignAttributes.call(this, actor);
            }

            case "override-attributes": {
                return;
            }
        }
    });
}

async function assignAttributes(this: CharacterImporterTool, actor: CharacterPF2e) {
    const data = this.getImportData(actor);
    if (!data) return;

    const levels = R.pullObject(getLevelsAttributes(data, actor), R.prop("level"), R.prop("boosts"));

    await assignBoosts(actor.ancestry, data.attributes.ancestry.boosts);
    await assignBoosts(actor.background, data.attributes.background);

    if (actor.class) {
        const selected = data.attributes.class[0];
        const available = actor.class._source.system.keyAbility.value;

        if (available.length > 1 && R.isIncludedIn(selected, available)) {
            await actor.class.update({ "system.keyAbility.selected": selected });
        }
    }

    await actor.update({ "system.build.attributes.boosts": levels });
}

async function assignBoosts(item: ItemWithAssignableBoosts | null, data: AttributeString[]): Promise<void> {
    if (!item) return;

    const boosts = validateBoosts(data);
    const recipiants = R.pipe(
        item._source.system.boosts,
        R.entries(),
        R.filter(([index, { value }]) => value.length > 1),
    );
    if (!recipiants.length || !boosts.length) return;

    const assigned: AttributeString[][] = [];

    for (const key of boosts) {
        const assignables = R.pipe(
            recipiants,
            R.filter(([index, { value }]) => R.isIncludedIn(key, value)),
            R.map(([index]) => Number(index)),
        );

        if (!assigned.length) {
            assigned.push(
                ...assignables.map((index) => {
                    const arr: AttributeString[] = [];
                    arr[index] = key;
                    return arr;
                }),
            );
            continue;
        }

        for (const index of assignables) {
            for (const list of assigned) {
                if (list.at(index)) continue;
                list[index] = key;
            }
        }
    }

    const match = assigned.find((list) => list.length === recipiants.length && list.every(R.isTruthy));
    if (!match) return;

    const update = R.pipe(
        match,
        R.map((key, index) => [index, { selected: key }] as const),
        R.fromEntries(),
    );

    return item.update({ "system.boosts": update });
}

type ItemWithAssignableBoosts = {
    _source: {
        system: {
            boosts: AssignableBoosts;
        };
    };
    update(data: Record<string, unknown>): Promise<any>;
};

type AssignableBoosts = Record<number | string, { value: AttributeString[]; selected: AttributeString | null }>;

function getLevelsAttributes(
    data: ImportDataModel,
    actor: CharacterPF2e,
): { level: AttributeLevel; boosts: AttributeString[] }[] {
    const actorLevel = actor.level;

    return R.pipe(
        data.attributes.levels,
        R.entries(),
        R.filter(([level]) => {
            return R.isIncludedIn(level, ImportDataModel.attributeLevels) && Number(level) <= actorLevel;
        }),
        R.map(([level, boosts]): { level: AttributeLevel; boosts: AttributeString[] } => {
            return {
                level,
                boosts: validateBoosts(boosts),
            };
        }),
    );
}

function validateBoosts(boosts: unknown): AttributeString[] {
    if (!R.isArray(boosts)) return [];
    return R.filter(boosts, (key): key is AttributeString => R.isIncludedIn(key, ImportDataModel.attributeKeys));
}

function prepareEntry(
    this: CharacterImporterTool,
    itemType: ImportDataEntryKey,
    entry: ImportEntry,
    current: ItemPF2e | null,
): ImportDataEntry {
    const isFeat = itemType === "feat";
    const isOverride = !!entry.override;
    const selection = ImportDataModel.getSelection(entry);
    const uuid = selection?.uuid;
    const matchLabel = this.localize("sheet.data.entry", isOverride ? "override" : "match");

    const label = game.i18n.localize(
        isFeat ? CONFIG.PF2E.featCategories[(entry as ImportFeatEntry).category] : `TYPES.Item.${itemType}`,
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
        }),
    );

    return {
        actions,
        children: [],
        current,
        img: selection?.img || SYSTEM.getPath(`icons/default-icons/${itemType}.svg`),
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

function prepareFeatEntry(
    this: CharacterImporterTool,
    actor: CharacterPF2e,
    data: ImportDataModel,
    entry: ImportFeatEntry,
    index: number,
    matchLevel: boolean,
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

/**
 * https://github.com/foundryvtt/pf2e/blob/a4049bd76dab59cb992e77b8c5c447d793940a85/src/module/actor/character/apps/attribute-builder.ts#L221
 */
function boostIsPartial(
    actor: CharacterPF2e,
    attribute: AttributeString,
    level: number,
    isApex: boolean = false,
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

type EventAction = "assign-attributes" | "override-attributes";

type ImportDataCoreContext = {
    attributes: ImportDataAttributesContext;
    classItem: ClassPF2e | null;
    entries: ImportDataEntry[];
    warning: string | null;
};

type ImportDataAttributesContext = {
    ancestry: {
        boosts: ImportDataBoostsEntry<"Boost">;
        flaws: ImportDataBoostsEntry<"Flaw"> | null;
    };
    background: ImportDataBoostsEntry<"Boost">;
    class: ImportDataBoostsEntry<"KeyIcon">;
    labels: typeof ImportDataModel.attributeKeys;
    levels: ImportDataBoostsEntry<"Boost" | "Partial">[];
    totals: AttributesRow<number>;
};

type ImportDataFeatEntry = Omit<ImportDataEntry, "itemType"> & {
    index: number;
    itemType: "feat";
    level: number;
    parent: FeatEntryParent | undefined;
};

type ImportDataBoostsEntry<T extends ImportDataBoostType> = {
    label: string;
    boosts: ImportDataBoosts<T>;
};

type ImportDataBoostType = "Boost" | "Partial" | "Flaw" | "KeyIcon";

type ImportDataBoost<T extends ImportDataBoostType> = {
    locked: boolean;
    selected: boolean;
    type: T;
};

type ImportDataBoosts<T extends ImportDataBoostType> = AttributesRow<ImportDataBoost<T> | null>;

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

type AttributesRow<T> = [T, T, T, T, T, T];

export { addCoreEventListeners, prepareCoreTab };
export type { ImportDataContextActionType, ImportDataCoreContext };
