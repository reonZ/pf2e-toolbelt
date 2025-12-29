import { AttributeString, FeatOrFeatureCategory, OneToTen, R, sluggify } from "module-helpers";
import { getCoreUuidFromPack, getFeatUuidFromPack } from ".";
import {
    AttributeLevel,
    ImportDataCoreKey,
    ImportDataEntrySource,
    ImportDataFeatEntrySource,
    ImportDataModel,
    ImportDataSource,
} from "..";

const FEAT_CATEGORIES: Record<string, FeatOrFeatureCategory> = {
    "ancestry-feat": "ancestry",
    ancestry: "ancestryfeature",
    "awarded-feat": "bonus",
    // "": "calling",
    "class-feat": "class",
    class: "classfeature",
    // "": "curse",
    // "": "deityboon",
    "general-feat": "general",
    // "": "pfsboon",
    "skill-feat": "skill",
};

async function fromPathbuilder(raw: unknown): Promise<ImportDataSource> {
    const data = raw && R.isPlainObject(raw) && R.isPlainObject(raw.build) ? raw.build : {};
    const classe = await parseCoreEntry(data, "class");
    const classParentKey = classe ? `${sluggify(classe.value)}-feat` : null;

    const featsPromises = (R.isArray(data.feats) ? data.feats : []).map(
        async (entry, i, feats): Promise<DataFeatEntrySource | undefined> => {
            if (!R.isArray(entry)) return;

            const [value, _, categoryValue, level, child, choice, parent] = entry;
            if (!R.isString(value) || !R.isString(categoryValue) || !R.isNumber(level)) return;

            const sluggifiedCategory = sluggify(categoryValue);
            const categoryK = sluggifiedCategory === classParentKey ? "class" : sluggifiedCategory;
            const category = FEAT_CATEGORIES[categoryK];
            if (!category) return;

            const hasParent = choice === "childChoice" && R.isString(parent);
            const foundParent = hasParent
                ? R.findLast(feats.slice(0, i), (feat): feat is RawFeatEntry => {
                      return R.isArray(feat) && feat[5] === "parentChoice" && feat[4] === parent;
                  })
                : undefined;

            const parentCategory = foundParent ? sluggify(foundParent[2]) : "";
            const parentIsCore = ImportDataModel.isCoreEntry(parentCategory);

            return {
                level: Math.clamp(level, 1, 10) as OneToTen,
                match: await getFeatUuidFromPack(value, category),
                category,
                value,
                parent: parentIsCore ? parentCategory : undefined,
                childEntry: choice === "parentChoice" && R.isString(child) ? child : undefined,
                parentEntry: hasParent && !parentIsCore ? parent : undefined,
            };
        }
    );

    // we need to process feats in 2 steps because we want to use index as parent and we need to filter out first
    const feats = R.pipe(
        await Promise.all(featsPromises),
        R.filter(R.isTruthy),
        R.forEach((feat, i, feats) => {
            if (!feat.parentEntry) return;

            const index = feats.slice(0, i).findLastIndex((x) => {
                return x.level === feat.level && x.childEntry === feat.parentEntry;
            });

            if (R.isNumber(index)) {
                feat.parent = String(index) as `${number}`;
            }
        })
    );

    const getBoosts = (boosts: unknown): AttributeString[] => {
        if (!R.isArray(boosts)) return [];

        return R.pipe(
            boosts,
            R.filter((v) => R.isString(v)),
            R.map((v) => v.toLowerCase()),
            R.filter((v) => R.isIncludedIn(v, ImportDataModel.attributeKeys))
        );
    };

    const rawBoosts = foundry.utils.getProperty(data, "abilities.breakdown.mapLevelledBoosts");
    const levelsBoosts = R.pipe(
        R.isPlainObject(rawBoosts) ? rawBoosts : {},
        R.entries(),
        R.filter((entry): entry is [AttributeLevel, unknown] => {
            return R.isIncludedIn(entry[0], ImportDataModel.attributeLevels);
        }),
        R.map(([key, boosts]) => {
            return [key, getBoosts(boosts)] as const;
        }),
        R.fromEntries()
    );

    const getBoostsAtPath = (path: BoostsPath): AttributeString[] => {
        const boosts = foundry.utils.getProperty(data, `abilities.breakdown.${path}`);
        return getBoosts(boosts);
    };

    const attributes = R.pipe(
        ImportDataModel.attributeKeys,
        R.map((attr) => {
            const raw = foundry.utils.getProperty(data, `abilities.${attr}`);
            const value = R.isNumber(raw) ? raw : 10;
            const mod = Math.floor((value - 10) / 2);

            return [attr, mod] as const;
        }),
        R.fromEntries()
    );

    const source: ImportDataSource = {
        ancestry: await parseCoreEntry(data, "ancestry"),
        attributes: {
            ancestry: {
                boosts: getBoostsAtPath("ancestryFree"),
                flaws: getBoostsAtPath("ancestryFlaws"),
                locked: getBoostsAtPath("ancestryBoosts"),
            },
            background: getBoostsAtPath("backgroundBoosts"),
            class: getBoostsAtPath("classBoosts"),
            levels: levelsBoosts,
            values: attributes,
        },
        background: await parseCoreEntry(data, "background"),
        class: classe,
        feats: feats as ImportDataFeatEntrySource[],
        heritage: await parseCoreEntry(data, "heritage"),
        level: R.isNumber(data.level) ? data.level : undefined,
        name: R.isString(data.name) ? data.name : "",
    };

    return source;
}

async function parseCoreEntry(
    data: Record<PropertyKey, unknown>,
    key: ImportDataCoreKey
): Promise<ImportDataEntrySource | undefined> {
    const value = data[key];
    if (!R.isString(value)) return;

    const source: DataEntrySource = {
        value,
        match: await getCoreUuidFromPack(value, key),
    };

    return source as ImportDataEntrySource;
}

type RawFeatEntry = [
    string,
    null,
    string,
    number,
    string | undefined,
    "childChoice" | "parentChoice" | "standardChoice" | undefined,
    string | undefined | null
];

type BoostsPath =
    | "ancestryBoosts"
    | "ancestryFree"
    | "ancestryFlaws"
    | "backgroundBoosts"
    | "classBoosts";

type DataEntrySource = WithPartial<ImportDataEntrySource, "override">;

type DataFeatEntrySource = WithPartial<ImportDataFeatEntrySource, "override" | "parent"> & {
    childEntry?: string;
    parentEntry?: string;
};

export { fromPathbuilder };
