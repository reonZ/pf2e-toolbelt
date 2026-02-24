import {
    addListenerAll,
    AttributeString,
    CharacterPF2e,
    ClassPF2e,
    FeatPF2e,
    getItemSlug,
    ItemPF2e,
    ItemUUID,
    R,
    SYSTEM,
} from "foundry-helpers";
import {
    ATTRIBUTE_KEYS,
    AttributeLevel,
    CHARACTER_CATEGORIES,
    CharacterCategory,
    CharacterImport,
    CharacterImporterTool,
    FeatEntryParent,
    getEntrySelection,
    ImportedEntry,
    ImportedFeatEntry,
    isAttributeKey,
    isAttributeLevel,
    itemCanBeRefreshed,
} from "tools";

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
    data: CharacterImport,
): Promise<ImportDataCoreContext> {
    const actorLevel = actor.level;
    const dataLevel = data.level;

    const entries: ImportDataEntry[] = CHARACTER_CATEGORIES.map((itemType) => {
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
                boosts: R.map(ATTRIBUTE_KEYS, (key): ImportDataBoost<"Boost" | "Partial"> => {
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
        ATTRIBUTE_KEYS,
        R.map((key) => data.attributes.values[key] ?? 0),
    );

    const allAncestryBoosts = [...data.attributes.ancestry.boosts, ...data.attributes.ancestry.locked];
    const ancestryBoosts: ImportDataBoostsEntry<"Boost"> = {
        boosts: R.map(ATTRIBUTE_KEYS, (key): ImportDataBoost<"Boost"> => {
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
              boosts: R.map(ATTRIBUTE_KEYS, (key): ImportDataBoost<"Flaw"> | null => {
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
        boosts: R.map(ATTRIBUTE_KEYS, (key): ImportDataBoost<"Boost"> => {
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
        boosts: R.map(ATTRIBUTE_KEYS, (key): ImportDataBoost<"KeyIcon"> | null => {
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
            labels: ATTRIBUTE_KEYS,
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
    const data = await this.getImportData(actor);
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
        R.filter(([_index, { value }]) => value.length > 1),
    );
    if (!recipiants.length || !boosts.length) return;

    const assigned: AttributeString[][] = [];

    for (const key of boosts) {
        const assignables = R.pipe(
            recipiants,
            R.filter(([_index, { value }]) => R.isIncludedIn(key, value)),
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
    data: CharacterImport,
    actor: CharacterPF2e,
): { level: AttributeLevel; boosts: AttributeString[] }[] {
    const actorLevel = actor.level;

    return R.pipe(
        data.attributes.levels,
        R.entries(),
        R.filter((entry): entry is [AttributeLevel, AttributeString[]] => {
            return isAttributeLevel(entry[0]) && Number(entry[0]) <= actorLevel;
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
    return R.filter(boosts, isAttributeKey);
}

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
    labels: typeof ATTRIBUTE_KEYS;
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
    selection: ItemPF2e | null;
    source: {
        label: string;
        uuid: Maybe<ItemUUID>;
    };
};

type ImportDataContextActionType = keyof typeof ACTION_ICONS;

type ImportDataContextAction = {
    type: ImportDataContextActionType;
    icon: string;
    label: string;
};

type AttributesRow<T> = [T, T, T, T, T, T];

type ImportDataEntryKey = CharacterCategory | "feat";

export { addCoreEventListeners, prepareCoreTab };
export type { ImportDataContextActionType, ImportDataCoreContext };
