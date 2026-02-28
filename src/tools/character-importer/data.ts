import { AttributeString, FeatOrFeatureCategory, ItemType, R, z, ZeroToFour, zForeignItem } from "foundry-helpers";

const ANCESTRY_KEYS = ["boosts", "flaws", "locked"] as const;
const ATTRIBUTE_KEYS = ["str", "dex", "con", "int", "wis", "cha"] as const;
const ATTRIBUTE_LEVELS = ["1", "5", "10", "15", "20"] as const;
const CHARACTER_CATEGORIES = ["ancestry", "heritage", "background", "class"] as const;

function zBoosts() {
    return z.array(z.enum(ATTRIBUTE_KEYS)).default([]);
}

function zBoostsRecord(keys: ReadonlyArray<string>) {
    return z.record(z.enum(keys), zBoosts()).default(R.fromKeys(keys, () => []));
}

function zImportedEntry<T extends ItemType>(type: T) {
    return z.object({
        match: zForeignItem(type, false),
        override: zForeignItem(type, false).optional(),
        value: z.string().trim().default(""),
    });
}

function zAttributes() {
    return z
        .object({
            ancestry: zBoostsRecord(ANCESTRY_KEYS),
            background: zBoosts(),
            class: zBoosts(),
            levels: zBoostsRecord(ATTRIBUTE_LEVELS),
            values: z
                .record(z.enum(ATTRIBUTE_KEYS), z.number().multipleOf(1))
                .default(R.fromKeys(ATTRIBUTE_KEYS, () => 0)),
        })
        .default({
            ancestry: R.fromKeys(ANCESTRY_KEYS, () => []),
            background: [],
            class: [],
            levels: R.fromKeys(ATTRIBUTE_LEVELS, () => []),
            values: R.fromKeys(ATTRIBUTE_KEYS, () => 0),
        });
}

function zFeat() {
    return zImportedEntry("feat").extend({
        awarded: z.boolean().default(false),
        level: z.number().min(1).multipleOf(1).default(1),
        category: z.enum(R.keys(CONFIG.PF2E.featCategories)),
        parent: z
            .custom<FeatEntryParent>((value) => {
                if (!R.isString(value) || !value.trim()) return false;
                return isCharacterCategory(value) || !isNaN(Number(value));
            })
            .optional(),
    });
}

const zProficiencyRank = z
    .custom((value) => R.isNumber(value) && Number.between(value, 0, 4, true))
    .default(0) as z.ZodDefault<z.ZodCustom<ZeroToFour, ZeroToFour>>;

function zSkills() {
    return z
        .record(z.enum(R.keys(CONFIG.PF2E.skills)), zProficiencyRank)
        .default(R.mapValues(CONFIG.PF2E.skills, () => 0 as ZeroToFour));
}

const zLore = z.object({
    label: z.string().nonempty(),
    rank: zProficiencyRank,
});

function zCharacterImport() {
    return z.object({
        name: z.string().default(""),
        attributes: zAttributes(),
        feats: z.array(zFeat()).prefault([]),
        level: z.number().min(1).multipleOf(1).default(1),
        lores: z.array(zLore).prefault([]),
        skills: zSkills(),
        ...R.fromKeys(CHARACTER_CATEGORIES, (category) => zImportedEntry(category).prefault({} as any)),
    });
}

function getEntrySelection<T extends ImportedEntry>(entry: T): Exclude<T["override"] | T["match"], undefined> | null {
    return (entry.override ?? entry.match ?? null) as Exclude<T["override"] | T["match"], undefined> | null;
}

function isValidImportEntry(value: unknown): value is CharacterCategory | "feat" {
    return R.isIncludedIn(value, [...CHARACTER_CATEGORIES, "feat"]);
}

function isCharacterCategory(value: unknown): value is CharacterCategory {
    return R.isIncludedIn(value, CHARACTER_CATEGORIES);
}

function isAttributeKey(value: unknown): value is AttributeString {
    return R.isIncludedIn(value, ATTRIBUTE_KEYS);
}

function isAttributeLevel(value: unknown): value is AttributeLevel {
    return R.isIncludedIn(value, ATTRIBUTE_LEVELS);
}

type AttributeLevel = (typeof ATTRIBUTE_LEVELS)[number];

type FeatEntryParent = CharacterCategory | `${number}`;

type CharacterCategory = (typeof CHARACTER_CATEGORIES)[number];

type CharacterImportSource = z.input<ReturnType<typeof zCharacterImport>>;
type CharacterImportData = z.output<ReturnType<typeof zCharacterImport>>;

type ImportedEntrySource = z.input<ReturnType<typeof zImportedEntry>>;
type ImportedEntry = z.output<ReturnType<typeof zImportedEntry>>;

type ImportedFeatSource = z.input<ReturnType<typeof zFeat>>;
type ImportedFeatEntry = z.output<ReturnType<typeof zFeat>>;

export {
    ATTRIBUTE_KEYS,
    CHARACTER_CATEGORIES,
    getEntrySelection,
    isAttributeKey,
    isAttributeLevel,
    isCharacterCategory,
    isValidImportEntry,
    zCharacterImport,
};
export type {
    AttributeLevel,
    CharacterCategory,
    CharacterImportData,
    CharacterImportSource,
    FeatEntryParent,
    ImportedEntry,
    ImportedEntrySource,
    ImportedFeatEntry,
    ImportedFeatSource,
};
