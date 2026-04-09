import {
    AttributeString,
    getPhysicalItemTypes,
    ItemType,
    R,
    SPELLCASTING_CATEGORIES,
    z,
    zAttribute,
    zDocumentId,
    ZeroToFour,
    ZeroToTen,
    zForeignItem,
    zRange,
} from "foundry-helpers";

const ANCESTRY_KEYS = ["boosts", "flaws", "locked"] as const;
const ATTRIBUTE_KEYS = ["str", "dex", "con", "int", "wis", "cha"] as const;
const ATTRIBUTE_LEVELS = ["1", "5", "10", "15", "20"] as const;
const CHARACTER_CATEGORIES = ["ancestry", "heritage", "background", "class"] as const;

const zBoosts = z.array(z.enum(ATTRIBUTE_KEYS)).default([]);

function zBoostsRecord(keys: ReadonlyArray<string>) {
    return z.record(z.enum(keys), zBoosts).default(R.fromKeys(keys, () => []));
}

function zImportedEntry<T extends ItemType | "physical">(type: T) {
    return z.object({
        match: zForeignItem(type, false),
        override: zForeignItem(type, false).optional(),
        value: z.string().trim(),
    });
}

const zAttributes = z
    .object({
        ancestry: zBoostsRecord(ANCESTRY_KEYS),
        background: zBoosts,
        class: zBoosts,
        levels: zBoostsRecord(ATTRIBUTE_LEVELS),
        values: z.record(z.enum(ATTRIBUTE_KEYS), z.number().multipleOf(1)).default(R.fromKeys(ATTRIBUTE_KEYS, () => 0)),
    })
    .default({
        ancestry: R.fromKeys(ANCESTRY_KEYS, () => []),
        background: [],
        class: [],
        levels: R.fromKeys(ATTRIBUTE_LEVELS, () => []),
        values: R.fromKeys(ATTRIBUTE_KEYS, () => 0),
    });

function zFeat() {
    const categories = [...R.keys(CONFIG.PF2E.featCategories), "archetype"] as const;

    return zImportedEntry("feat").extend({
        awarded: z.boolean().default(false),
        level: z.number().min(1).multipleOf(1).default(1),
        category: z.enum(categories),
        parent: z
            .custom<FeatEntryParent>((value) => {
                if (!R.isString(value) || !value.trim()) return false;
                return isCharacterCategory(value) || !isNaN(Number(value));
            })
            .optional(),
    });
}

const zContainer = zImportedEntry("backpack").extend({
    identifier: z.string(),
    quantity: z.number().min(1).multipleOf(1).default(1),
});

function zEquipment() {
    const types = getPhysicalItemTypes();

    return zImportedEntry("physical").extend({
        container: z.string().nonempty().optional(),
        quantity: z.number().min(1).multipleOf(1).default(1),
        type: z.enum(types).default("equipment"),
    });
}

const zProficiencyRank = zRange<ZeroToFour>(0, 4);
const zSpellRank = zRange<ZeroToTen>(0, 10);

function zSkills() {
    return z
        .record(z.enum(R.keys(CONFIG.PF2E.skills)), zProficiencyRank)
        .default(R.mapValues(CONFIG.PF2E.skills, () => 0 as ZeroToFour));
}

const zLore = z.object({
    label: z.string().nonempty(),
    rank: zProficiencyRank,
});

function zCurrencies() {
    return z
        .record(z.enum(R.keys(CONFIG.PF2E.currencies)), z.number().min(0).multipleOf(1))
        .default(R.mapValues(CONFIG.PF2E.currencies, () => 0));
}

const zSpell = zImportedEntry("spell").extend({
    parent: z.string(),
    rank: zSpellRank,
});

function zSpellcastingEntry() {
    return z.object({
        attribute: zAttribute(),
        identifier: z.string(),
        name: z.string().nonempty(),
        selected: zDocumentId().nullable().default(null),
        slots: z.tuple(R.times(11, () => z.number().min(0).multipleOf(1).default(0))),
        tradition: z.enum(R.keys(CONFIG.PF2E.magicTraditions)),
        type: z.enum(SPELLCASTING_CATEGORIES),
    });
}

function zCharacterImport() {
    return z.object({
        age: z.string().default(""),
        attributes: zAttributes,
        containers: z.array(zContainer).prefault([]),
        currencies: zCurrencies(),
        equipments: z.array(zEquipment()).prefault([]),
        feats: z.array(zFeat()).prefault([]),
        gender: z.string().default(""),
        languages: z.array(z.enum(R.keys(CONFIG.PF2E.languages))).prefault([]),
        level: z.number().min(1).multipleOf(1).default(1),
        lores: z.array(zLore).prefault([]),
        name: z.string().default(""),
        skills: zSkills(),
        spellcasting: z.array(zSpellcastingEntry()).prefault([]),
        spells: z.array(zSpell).prefault([]),
        ...R.fromKeys(CHARACTER_CATEGORIES, (category) => zImportedEntry(category).prefault({} as any)),
    });
}

function getEntrySelection<T extends ImportedEntry>(entry: T): Exclude<T["override"] | T["match"], undefined> | null {
    return (entry.override ?? entry.match ?? null) as Exclude<T["override"] | T["match"], undefined> | null;
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

type ImportedContainerSource = z.input<typeof zContainer>;
type ImportedContainerEntry = z.output<typeof zContainer>;

type ImportedEquipmentSource = z.input<ReturnType<typeof zEquipment>>;
type ImportedEquipmentEntry = z.output<ReturnType<typeof zEquipment>>;

type ImportedSpellcastingSource = z.input<ReturnType<typeof zSpellcastingEntry>>;
type ImportedSpellcastingEntry = z.output<ReturnType<typeof zSpellcastingEntry>>;

type ImportedSpellSource = z.input<typeof zSpell>;
type ImportedSpellEntry = z.output<typeof zSpell>;

export {
    ATTRIBUTE_KEYS,
    CHARACTER_CATEGORIES,
    getEntrySelection,
    isAttributeKey,
    isAttributeLevel,
    isCharacterCategory,
    zCharacterImport,
};
export type {
    AttributeLevel,
    CharacterCategory,
    CharacterImportData,
    CharacterImportSource,
    FeatEntryParent,
    ImportedContainerEntry,
    ImportedContainerSource,
    ImportedEntry,
    ImportedEntrySource,
    ImportedEquipmentEntry,
    ImportedEquipmentSource,
    ImportedFeatEntry,
    ImportedFeatSource,
    ImportedSpellcastingEntry,
    ImportedSpellcastingSource,
    ImportedSpellEntry,
    ImportedSpellSource,
};
