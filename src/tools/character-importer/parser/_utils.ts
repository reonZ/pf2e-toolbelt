import { FeatOrFeatureCategory, ItemUUID, R, SYSTEM } from "foundry-helpers";
import { CharacterCategory } from "..";

const CORE_PACKS: Record<CharacterCategory, string> = {
    ancestry: "ancestries",
    background: "backgrounds",
    class: "classes",
    heritage: "heritages",
};

const FEAT_PACKS: PartialRecord<FeatOrFeatureCategory, string> = {
    ancestryfeature: "ancestryfeatures",
    classfeature: "classfeatures",
};

const FEATS_PACK = "feats-srd";

async function getUuidFromPack(value: string, packName: string): Promise<ItemUUID | null> {
    if (!R.isTruthy(value)) return null;

    const pack = SYSTEM.getPack(packName);
    if (!pack) return null;

    const slug = SYSTEM.sluggify(value);
    const collection = await pack.getIndex({ fields: ["system.slug"] });
    const entry = collection.find((entry) => entry.system?.slug === slug);

    return (entry?.uuid ?? null) as ItemUUID | null;
}

async function getCoreUuidFromPack(value: string, category: CharacterCategory): Promise<ItemUUID | null> {
    return value ? getUuidFromPack(value, CORE_PACKS[category]) : null;
}

async function getFeatUuidFromPack(value: string, category: FeatOrFeatureCategory): Promise<ItemUUID | null> {
    const pack = FEAT_PACKS[category] ?? FEATS_PACK;
    return getUuidFromPack(value, pack);
}

export { CORE_PACKS, getCoreUuidFromPack, getFeatUuidFromPack };
