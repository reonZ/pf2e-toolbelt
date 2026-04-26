import {
    AttributeString,
    CompendiumIndexData,
    FeatOrFeatureCategory,
    ItemUUID,
    MagicTradition,
    PhysicalItemType,
    R,
    SPELLCASTING_CATEGORIES,
    SpellcastingCategory,
    SYSTEM,
    valueBetween,
    ZeroToTen,
} from "foundry-helpers";
import { CharacterCategory } from "..";

const CORE_PACKS: Record<CharacterCategory, [string, string]> = {
    ancestry: ["ancestries", "ancestries"],
    background: ["backgrounds", "backgrounds"],
    class: ["classes", "classes"],
    heritage: ["heritages", "heritages"],
};

const FEAT_PACKS: PartialRecord<FeatOrFeatureCategory | "archetype", [string, string]> = {
    ancestryfeature: ["ancestryfeatures", "ancestry-features"],
    classfeature: ["classfeatures", "class-features"],
} as const;

const EQUIPMENT_PACK = ["equipment-srd", "equipment"] as const;
const FEATS_PACK = ["feats-srd", "feats"] as const;
const SPELLS_PACK = ["spells-srd", "spells"] as const;

async function getUuidFromPack(
    value: string,
    packNames: readonly [string, string],
): Promise<CompendiumIndexData | null> {
    if (!R.isTruthy(value)) return null;

    // both anachronism modules use the sf2e naming for packs
    const [systemName, moduleName] = SYSTEM.id === "pf2e" ? packNames : [packNames[1], packNames[1]];
    const packs = R.filter([SYSTEM.getSystemPack(systemName), SYSTEM.getAnachronismPack(moduleName)], R.isTruthy);

    for (const pack of packs) {
        const slug = SYSTEM.sluggify(value);
        const collection = await pack.getIndex({ fields: ["system.slug"] });
        const entry = collection.find((entry) => entry.system?.slug === slug);

        if (entry) {
            return entry;
        }
    }

    return null;
}

async function getCoreUuidFromPack(value: string, category: CharacterCategory): Promise<ItemUUID | null> {
    const entry = await getUuidFromPack(value, CORE_PACKS[category]);
    return (entry?.uuid ?? null) as ItemUUID | null;
}

async function getFeatUuidFromPack(
    value: string,
    category: FeatOrFeatureCategory | "archetype",
): Promise<ItemUUID | null> {
    const pack = FEAT_PACKS[category] ?? FEATS_PACK;
    const entry = await getUuidFromPack(value, pack);
    return (entry?.uuid ?? null) as ItemUUID | null;
}

async function getEquipmentUuidFromPack(value: string): Promise<{ type: PhysicalItemType; uuid: ItemUUID | null }> {
    const entry = await getUuidFromPack(value, EQUIPMENT_PACK);
    return {
        type: (entry?.type ?? "equipment") as PhysicalItemType,
        uuid: (entry?.uuid ?? null) as ItemUUID | null,
    };
}

async function getSpellUuidFromPack(value: string): Promise<ItemUUID | null> {
    const entry = await getUuidFromPack(value, SPELLS_PACK);
    return (entry?.uuid ?? null) as ItemUUID | null;
}

function isAttribute(value: unknown): value is AttributeString {
    return R.isString(value) && value in CONFIG.PF2E.abilities;
}

function isMagicTradition(value: unknown): value is MagicTradition {
    return R.isString(value) && value in CONFIG.PF2E.magicTraditions;
}

function isSpellcastingCategory(value: unknown): value is SpellcastingCategory {
    return R.isString(value) && R.isIncludedIn(value, SPELLCASTING_CATEGORIES);
}

function isSpellRank(value: unknown): value is ZeroToTen {
    return R.isNumber(value) && valueBetween(value, 0, 10);
}

export {
    getCoreUuidFromPack,
    getEquipmentUuidFromPack,
    getFeatUuidFromPack,
    getSpellUuidFromPack,
    isAttribute,
    isMagicTradition,
    isSpellcastingCategory,
    isSpellRank,
};
