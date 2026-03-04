import {
    AttributeString,
    FeatOrFeatureCategory,
    OneToTen,
    R,
    SYSTEM,
    valueBetween,
    ZeroToFour,
    ZeroToTen,
} from "foundry-helpers";
import {
    ATTRIBUTE_KEYS,
    AttributeLevel,
    CharacterCategory,
    CharacterImportSource,
    ImportedContainerSource,
    ImportedEntrySource,
    ImportedEquipmentSource,
    ImportedFeatSource,
    ImportedSpellcastingSource,
    ImportedSpellSource,
    isAttributeKey,
    isAttributeLevel,
    isCharacterCategory,
} from "..";

import {
    getCoreUuidFromPack,
    getEquipmentUuidFromPack,
    getFeatUuidFromPack,
    getSpellUuidFromPack,
    isAttribute,
    isMagicTradition,
    isSpellcastingCategory,
    isSpellRank,
} from ".";

const BACKPACK_UUID = "Compendium.pf2e.equipment-srd.Item.3lgwjrFEsQVKzhh7";
const SPACIOUS_POUCH_UUID = "Compendium.pf2e.equipment-srd.Item.jaEEvuQ32GjAa8jy";

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

    const featsPromises = R.map(R.isArray(data.feats) ? data.feats : [], async (entry, i, feats): FeatSourcePromise => {
        if (!R.isArray(entry)) return;

        const [value, _, categoryValue, level, child, choice, parent] = entry;
        if (!R.isString(value) || !R.isString(categoryValue) || !R.isNumber(level)) return;

        const sluggifiedCategory = SYSTEM.sluggify(categoryValue);
        const categoryK = sluggifiedCategory === classParentKey ? "class" : sluggifiedCategory;
        const category = FEAT_CATEGORIES[categoryK];
        if (!category) return;

        const awarded = categoryK === "awarded-feat";
        const hasParent = choice === "childChoice" && R.isString(parent);
        const foundParent = hasParent
            ? R.findLast(feats.slice(0, i), (feat): feat is RawFeatEntry => {
                  return R.isArray(feat) && feat[5] === "parentChoice" && feat[4] === parent;
              })
            : undefined;

        const parentCategory = foundParent ? SYSTEM.sluggify(foundParent[2]) : "";
        const parentIsCore = isCharacterCategory(parentCategory);

        const featureMatch = awarded ? await getFeatUuidFromPack(value, "classfeature") : null;
        const match = featureMatch ?? (await getFeatUuidFromPack(value, category));

        return {
            awarded,
            level: Math.clamp(level, 1, 10) as OneToTen,
            match,
            category: featureMatch ? "classfeature" : category,
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

    const currencies = R.mapValues(CONFIG.PF2E.currencies, (_, slug) => {
        const value = foundry.utils.getProperty(data, `money.${slug}`);
        return R.isNumber(value) ? value : 0;
    });

    const containersPromises = R.map(
        R.entries(R.isPlainObject(data.equipmentContainers) ? data.equipmentContainers : {}),
        async ([identifier, entry]): Promise<ImportedContainerSource | undefined> => {
            if (!R.isPlainObject(entry) || !("containerName" in entry) || !R.isString(entry.containerName)) return;

            return {
                identifier,
                match: entry.bagOfHolding ? SPACIOUS_POUCH_UUID : BACKPACK_UUID,
                value: entry.containerName,
            };
        },
    );

    const containers = R.filter(await Promise.all(containersPromises), R.isTruthy);
    const containersIdentifiers = R.map(containers, R.prop("identifier"));
    const containersNames = R.map(containers, R.prop("value"));

    const equipmentsPromises = R.map(
        R.isArray(data.equipment) ? data.equipment : [],
        async (entry): Promise<ImportedEquipmentSource | undefined> => {
            if (!R.isArray(entry)) return;

            const [name, quantity, identifier] = entry;
            if (!R.isString(name) || !R.isNumber(quantity) || !R.isString(identifier)) return;
            if (R.isIncludedIn(name, containersNames)) return;

            const match = await getEquipmentUuidFromPack(name);

            return {
                container: R.isIncludedIn(identifier, containersIdentifiers) ? identifier : undefined,
                match: match.uuid,
                quantity: Math.max(quantity, 1),
                type: match.type,
                value: name,
            };
        },
    );

    const weaponsAndArmorsPromises = R.map(
        [...(R.isArray(data.weapons) ? data.weapons : []), ...(R.isArray(data.armor) ? data.armor : [])],
        async (entry): Promise<ImportedEquipmentSource | undefined> => {
            if (!R.isPlainObject(entry)) return;

            const { name, qty } = entry;
            if (!R.isString(name) || !R.isNumber(qty)) return;

            const match = await getEquipmentUuidFromPack(name);

            return {
                match: match.uuid,
                quantity: Math.max(qty, 1),
                type: match.type,
                value: name,
            };
        },
    );

    const allSpells: ImportedSpellSource[] = [];

    const spellcastingPromises = R.map(
        R.isArray(data.spellCasters) ? data.spellCasters : [],
        async (entry): Promise<ImportedSpellcastingSource | undefined> => {
            if (
                !R.isPlainObject(entry) ||
                !R.isString(entry.name) ||
                !isAttribute(entry.ability) ||
                !isMagicTradition(entry.magicTradition) ||
                !isSpellcastingCategory(entry.spellcastingType)
            )
                return;

            const identifier = foundry.utils.randomID();

            const spellsSlotsPromises = R.map(
                R.isArray(entry.spells) ? entry.spells : [],
                async (spellsEntry): Promise<ImportedSpellSource[] | undefined> => {
                    if (!R.isPlainObject(spellsEntry) || !isSpellRank(spellsEntry.spellLevel)) return;
                    return parseSpells(spellsEntry.list, identifier, spellsEntry.spellLevel);
                },
            );

            const spells = R.filter(await Promise.all(spellsSlotsPromises), R.isTruthy).flat();

            if (spells.length) {
                allSpells.push(...spells);
            } else {
                return;
            }

            return {
                attribute: entry.ability as AttributeString,
                identifier,
                name: entry.name,
                tradition: entry.magicTradition,
                type: entry.innate === true ? "innate" : entry.spellcastingType,
            };
        },
    );

    const focusPromises = R.pipe(
        R.isPlainObject(data.focus) ? data.focus : {},
        R.entries(),
        R.map(async ([tradition, entry]) => {
            if (!isMagicTradition(tradition) || !R.isPlainObject(entry)) return;

            const entries = R.pipe(
                R.entries(entry),
                R.map(async ([attribute, spellcastingEntry]): Promise<ImportedSpellcastingSource | undefined> => {
                    if (!isAttribute(attribute) || !R.isPlainObject(spellcastingEntry)) return;

                    const identifier = foundry.utils.randomID();
                    const spells = [
                        ...(await parseSpells(spellcastingEntry.focusCantrips, identifier, 1)),
                        ...(await parseSpells(spellcastingEntry.focusSpells, identifier, 1)),
                    ];

                    if (spells.length) {
                        allSpells.push(...spells);
                    } else {
                        return;
                    }

                    return {
                        attribute,
                        identifier,
                        name: game.i18n.localize("PF2E.Focus.Spells"),
                        tradition,
                        type: "focus",
                    };
                }),
            );

            return R.filter(await Promise.all(entries), R.isTruthy);
        }),
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
        containers,
        currencies,
        equipments: R.filter(await Promise.all([...weaponsAndArmorsPromises, ...equipmentsPromises]), R.isTruthy),
        feats: feats,
        heritage: await parseCoreEntry(data, "heritage"),
        level: R.isNumber(data.level) ? data.level : undefined,
        lores,
        name: R.isString(data.name) ? data.name : "",
        skills,
        spellcasting: [
            ...R.filter(await Promise.all(spellcastingPromises), R.isTruthy),
            ...R.filter(await Promise.all(focusPromises), R.isTruthy).flat(),
        ],
        spells: allSpells,
    };
}

async function parseSpells(list: unknown, parent: string, rank: ZeroToTen): Promise<ImportedSpellSource[]> {
    const spellsPromises = R.map(
        R.isArray(list) ? list : [],
        async (spellName): Promise<ImportedSpellSource | undefined> => {
            if (!R.isString(spellName)) return;
            return {
                match: await getSpellUuidFromPack(spellName),
                parent,
                rank,
                value: spellName,
            };
        },
    );
    return R.filter(await Promise.all(spellsPromises), R.isTruthy);
}

function parseSkillRank(value: unknown): ZeroToFour {
    const rank = R.isNumber(value) ? value / 2 : 0;
    return (valueBetween(rank, 0, 4) ? rank : 0) as ZeroToFour;
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
