import { AttributeString, FeatOrFeatureCategory, OneToTen, R, SYSTEM, ZeroToFour } from "foundry-helpers";
import {
    ATTRIBUTE_KEYS,
    AttributeLevel,
    CharacterCategory,
    CharacterImportSource,
    getCoreUuidFromPack,
    getFeatUuidFromPack,
    ImportedEntrySource,
    ImportedFeatSource,
    isAttributeKey,
    isAttributeLevel,
    isCharacterCategory,
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

async function fromPathbuilder(raw: unknown): Promise<CharacterImportSource> {
    const data = raw && R.isPlainObject(raw) && R.isPlainObject(raw.build) ? raw.build : {};
    const classe = await parseCoreEntry(data, "class");
    const classParentKey = classe ? `${SYSTEM.sluggify(classe.value)}-feat` : null;

    type FeatSourcePromise = Promise<(ImportedFeatSource & { childEntry?: string; parentEntry?: string }) | undefined>;

    const featsPromises = (R.isArray(data.feats) ? data.feats : []).map(async (entry, i, feats): FeatSourcePromise => {
        if (!R.isArray(entry)) return;

        const [value, _, categoryValue, level, child, choice, parent] = entry;
        if (!R.isString(value) || !R.isString(categoryValue) || !R.isNumber(level)) return;

        const sluggifiedCategory = SYSTEM.sluggify(categoryValue);
        const categoryK = sluggifiedCategory === classParentKey ? "class" : sluggifiedCategory;
        const category = FEAT_CATEGORIES[categoryK];
        if (!category) return;

        const hasParent = choice === "childChoice" && R.isString(parent);
        const foundParent = hasParent
            ? R.findLast(feats.slice(0, i), (feat): feat is RawFeatEntry => {
                  return R.isArray(feat) && feat[5] === "parentChoice" && feat[4] === parent;
              })
            : undefined;

        const parentCategory = foundParent ? SYSTEM.sluggify(foundParent[2]) : "";
        const parentIsCore = isCharacterCategory(parentCategory);

        return {
            awarded: categoryK === "awarded-feat",
            level: Math.clamp(level, 1, 10) as OneToTen,
            match: await getFeatUuidFromPack(value, category),
            category,
            value,
            parent: parentIsCore ? parentCategory : undefined,
            childEntry: choice === "parentChoice" && R.isString(child) ? child : undefined,
            parentEntry: hasParent && !parentIsCore ? parent : undefined,
        };
    });

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
        }),
    );

    const getBoosts = (boosts: unknown): AttributeString[] => {
        if (!R.isArray(boosts)) return [];

        return R.pipe(
            boosts,
            R.filter((v) => R.isString(v)),
            R.map((v) => v.toLowerCase()),
            R.filter(isAttributeKey),
        );
    };

    const rawBoosts = foundry.utils.getProperty(data, "abilities.breakdown.mapLevelledBoosts");
    const levelsBoosts = R.pipe(
        R.isPlainObject(rawBoosts) ? rawBoosts : {},
        R.entries(),
        R.filter((entry): entry is [AttributeLevel, unknown] => {
            return isAttributeLevel(entry[0]);
        }),
        R.map(([key, boosts]) => {
            return [key, getBoosts(boosts)] as const;
        }),
        R.fromEntries(),
    );

    const getBoostsAtPath = (path: BoostsPath): AttributeString[] => {
        const boosts = foundry.utils.getProperty(data, `abilities.breakdown.${path}`);
        return getBoosts(boosts);
    };

    const attributes = R.pipe(
        ATTRIBUTE_KEYS,
        R.map((attr) => {
            const raw = foundry.utils.getProperty(data, `abilities.${attr}`);
            const value = R.isNumber(raw) ? raw : 10;
            const mod = Math.floor((value - 10) / 2);

            return [attr, mod] as const;
        }),
        R.fromEntries(),
    );

    const skills = R.mapValues(CONFIG.PF2E.skills, (_, slug) => {
        const rank = foundry.utils.getProperty(data, `proficiencies.${slug}`);
        return parseSkillRank(rank);
    });

    const lores = R.pipe(
        R.isArray(data.lores) ? data.lores : [],
        R.map((entry) => {
            if (!R.isArray(entry)) return;

            const [label, rank] = entry;
            return R.isString(label) ? { label, rank: parseSkillRank(rank) } : undefined;
        }),
        R.filter(R.isTruthy),
    );

    return {
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
        feats: feats,
        heritage: await parseCoreEntry(data, "heritage"),
        level: R.isNumber(data.level) ? data.level : undefined,
        lores,
        name: R.isString(data.name) ? data.name : "",
        skills,
    };
}

function parseSkillRank(value: unknown): ZeroToFour {
    const rank = R.isNumber(value) ? value / 2 : 0;
    return (Number.between(rank, 0, 4, true) ? rank : 0) as ZeroToFour;
}

async function parseCoreEntry(
    data: Record<PropertyKey, unknown>,
    key: CharacterCategory,
): Promise<WithRequired<ImportedEntrySource, "value">> {
    const value = R.isString(data[key]) ? data[key] : "";
    return {
        value,
        match: await getCoreUuidFromPack(value, key),
    };
}

type RawFeatEntry = [
    string,
    null,
    string,
    number,
    string | undefined,
    "childChoice" | "parentChoice" | "standardChoice" | undefined,
    string | undefined | null,
];

type BoostsPath = "ancestryBoosts" | "ancestryFree" | "ancestryFlaws" | "backgroundBoosts" | "classBoosts";

export { fromPathbuilder };
