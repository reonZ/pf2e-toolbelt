import { AttributeString, CharacterPF2e, ItemPF2e, ItemType, ItemUUID, R, z, zForeignItem } from "foundry-helpers";
import { CharacterImporterTool } from ".";

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

function zCharacterImport() {
    return z.object({
        name: z.string().default(""),
        attributes: zAttributes(),
        feats: z.array(zFeat()).prefault([]),
        level: z.number().min(1).multipleOf(1).default(1),
        ...R.fromKeys(CHARACTER_CATEGORIES, (category) => zImportedEntry(category).prefault({} as any)),
    });
}

function getImportedEntry(
    data: CharacterImport,
    itemType: "feat",
    index?: number | string,
): ImportedFeatEntry | undefined;
function getImportedEntry<T extends CharacterCategory | "feat">(
    data: CharacterImport,
    itemType: T,
): ImportedEntry | undefined;
function getImportedEntry(data: CharacterImport, itemType: string, index?: number | string): ImportedEntry | undefined;
function getImportedEntry(data: CharacterImport, itemType: string, index?: number | string) {
    if (itemType === "feat") {
        const num = R.isString(index) ? Number(index.trim() || -1) : index;
        return R.isNumber(num) ? data.feats.at(num) : undefined;
    }
    return isCharacterCategory(itemType) ? data[itemType] : undefined;
}

async function updateEntryOverride(
    this: CharacterImporterTool,
    actor: CharacterPF2e,
    itemType: string | undefined,
    uuid: ItemUUID | null,
    index: number,
) {
    const data = await this.getImportData(actor);
    if (!data) return;

    const value = uuid ? await fromUuid<ItemPF2e>(uuid) : null;
    if (uuid && !value) return;

    if (itemType === "feat" && R.isNumber(index)) {
        updateFeatOverride(data, index, value);
    } else if (isCharacterCategory(itemType)) {
        updateCoreOverride(data, itemType, value);
    }

    return this.setImportData(actor, data);
}

function updateCoreOverride(data: CharacterImport, key: CharacterCategory, value: ItemPF2e | null) {
    if (value === null || data[key].match === value) {
        delete data[key].override;
    } else {
        data[key].override = value as any;
    }
}

async function updateFeatOverride(data: CharacterImport, index: number, value: ItemPF2e | null) {
    const feats = data.feats.slice();
    const entry = feats.at(Number(index));
    if (!entry) return;

    if (value === null || entry.match?.uuid === value.uuid) {
        delete entry.override;
    } else {
        entry.override = value as any;
    }
}

function getEntrySelection<T extends ImportedEntry>(entry: T): Exclude<T["override"] | T["match"], undefined> | null {
    return (entry.override ?? entry.match ?? null) as Exclude<T["override"] | T["match"], undefined> | null;
}

function isValidImportEntry(value: unknown): value is CharacterCategory | "feats" {
    return R.isIncludedIn(value, [...CHARACTER_CATEGORIES, "feats"]);
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
type CharacterImport = z.output<ReturnType<typeof zCharacterImport>>;

type ImportedEntrySource = z.input<ReturnType<typeof zImportedEntry>>;
type ImportedEntry = z.output<ReturnType<typeof zImportedEntry>>;

type ImportedFeatSource = z.input<ReturnType<typeof zFeat>>;
type ImportedFeatEntry = z.output<ReturnType<typeof zFeat>>;

export {
    ATTRIBUTE_KEYS,
    CHARACTER_CATEGORIES,
    getImportedEntry,
    isAttributeKey,
    isAttributeLevel,
    isCharacterCategory,
    isValidImportEntry,
    updateEntryOverride,
    zCharacterImport,
    getEntrySelection,
};
export type {
    AttributeLevel,
    CharacterCategory,
    CharacterImport,
    CharacterImportSource,
    FeatEntryParent,
    ImportedEntry,
    ImportedEntrySource,
    ImportedFeatEntry,
    ImportedFeatSource,
};
