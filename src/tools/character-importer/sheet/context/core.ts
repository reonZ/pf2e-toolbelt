import { addListenerAll, AttributeString, CharacterPF2e, ClassPF2e, R } from "foundry-helpers";
import {
    ATTRIBUTE_KEYS,
    AttributeLevel,
    CHARACTER_CATEGORIES,
    CharacterImport,
    CharacterImporterTool,
    ImportDataEntry,
    isAttributeKey,
    isAttributeLevel,
    prepareEntry,
    prepareFeatEntries,
} from "tools";

async function prepareCoreTab(
    this: CharacterImporterTool,
    actor: CharacterPF2e,
    data: CharacterImport,
): Promise<ImportDataCoreContext> {
    const actorLevel = actor.level;
    const dataLevel = data.level;

    const entries: ImportDataEntry[] = CHARACTER_CATEGORIES.map((itemType) => {
        const entry = data[itemType];

        return {
            ...prepareEntry.call(this, itemType, entry, actor[itemType], 0),
            children: prepareFeatEntries.call(this, actor, data, itemType, 1),
        };
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
                return setAttributes.call(this, actor);
            }
        }
    });
}

async function setAttributes(this: CharacterImporterTool, actor: CharacterPF2e) {
    const data = await this.getImportData(actor);
    if (!data) return;

    const values = data.attributes.values;
    const abilities = R.fromKeys(ATTRIBUTE_KEYS, (attr) => {
        return { value: 10, mod: values[attr] ?? 0 };
    });

    await actor.update({
        "system.abilities": abilities,
        "system.details.keyability.value": data.attributes.class[0],
    });

    this.localize.info("sheet.data.core.attributes.set.manual");
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

    await actor.update({
        "system.abilities": null,
        "system.build.attributes.boosts": levels,
    });

    this.localize.info("sheet.data.core.attributes.set.boosts");
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

type AttributesRow<T> = [T, T, T, T, T, T];

export { addCoreEventListeners, prepareCoreTab };
export type { ImportDataCoreContext };
