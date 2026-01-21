import { FeatOrFeatureCategory, R, SYSTEM, sluggify } from "module-helpers";
import { ImportDataCoreKey } from "..";

const CORE_PACKS: Record<ImportDataCoreKey, string> = {
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

    const pack = game.packs.get(`${SYSTEM.id}.${packName}`);
    if (!pack) return null;

    const slug = sluggify(value);
    const collection = await pack.getIndex({ fields: ["system.slug"] });
    const entry = collection.find((entry) => entry.system?.slug === slug);

    return (entry?.uuid ?? null) as ItemUUID | null;
}

async function getCoreUuidFromPack(value: string, category: ImportDataCoreKey) {
    const pack = CORE_PACKS[category];
    return getUuidFromPack(value, pack);
}

async function getFeatUuidFromPack(value: string, category: FeatOrFeatureCategory): Promise<ItemUUID | null> {
    const pack = FEAT_PACKS[category] ?? FEATS_PACK;
    return getUuidFromPack(value, pack);
}

export { CORE_PACKS, getCoreUuidFromPack, getFeatUuidFromPack };
