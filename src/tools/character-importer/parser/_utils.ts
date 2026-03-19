import {
    AttributeString,
    CompendiumCollection,
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

type CompendiumPacksRecord<T extends string> = Record<T, () => CompendiumCollection | undefined>;

const CORE_PACKS: CompendiumPacksRecord<CharacterCategory> = {
    ancestry: SYSTEM.pack("ancestries"),
    background: SYSTEM.pack("backgrounds"),
    class: SYSTEM.pack("classes"),
    heritage: SYSTEM.pack("heritages"),
};

const FEAT_PACKS: Partial<CompendiumPacksRecord<FeatOrFeatureCategory | "archetype">> = {
    ancestryfeature: SYSTEM.pack("ancestryfeatures", "ancestry-features"),
    classfeature: SYSTEM.pack("classfeatures", "class-features"),
};

const EQUIPMENT_PACK = SYSTEM.pack("equipment-srd", "equipment");
const FEATS_PACK = SYSTEM.pack("feats-srd", "feats");
const SPELLS_PACK = SYSTEM.pack("spells-srd", "spells");

async function getUuidFromPack(
    value: string,
    packFn: () => CompendiumCollection | undefined,
): Promise<CompendiumIndexData | null> {
    const pack = packFn();
    if (!R.isTruthy(value) || !pack) return null;

    const slug = SYSTEM.sluggify(value);
    const collection = await pack.getIndex({ fields: ["system.slug"] });
    const entry = collection.find((entry) => entry.system?.slug === slug);

    return entry ?? null;
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
    CORE_PACKS,
    getCoreUuidFromPack,
    getEquipmentUuidFromPack,
    getFeatUuidFromPack,
    getSpellUuidFromPack,
    isAttribute,
    isMagicTradition,
    isSpellcastingCategory,
    isSpellRank,
};
