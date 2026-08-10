import { R, SYSTEM, TokenDocumentPF2e, z, zClientDocument, zDocumentUUID, zSafeArray } from "foundry-helpers";
import { SAVE_TYPES } from "foundry-helpers/dist";
import { zTargetSaveInstance } from ".";

const AREA_TYPE = ["area-fire", "auto-fire"] as const;
const TARGET_MESSAGE_TYPE = ["area", "damage", "spell", "action", "check"] as const;

const zSaveVariant = z.object({
    basic: z.boolean().default(false),
    dc: z.number().min(0),
    saves: z.record(z.string(), zTargetSaveInstance).default({}),
    statistic: z.enum(SAVE_TYPES),
});

const zSaveVariants = z.record(z.string(), zSaveVariant).default({});

const zAppliedDamages = z.record(z.union([z.string(), z.number()]), z.boolean()).default({});
const zTargetsAppliedDamages = z.record(z.string(), zAppliedDamages).default({});

const zTokenDocumentArrayDecode = zSafeArray(zDocumentUUID("Token"), true).transform((uuids) => {
    return R.pipe(
        R.isArray(uuids) ? uuids : [],
        R.map((uuid): TokenDocumentPF2e | null => fromUuidSync(uuid, { strict: false })),
        R.filter(R.isTruthy),
        R.uniqueBy((token) => token.flags[SYSTEM.id].troop?.id ?? token.uuid),
    );
});

const zTokenDocumentArrayEncode = z
    .array(zClientDocument("Token"))
    .transform((tokens) => tokens.map((token) => token.uuid));

const zBaseTargetsData = z.object({
    applied: zTargetsAppliedDamages,
    area: z.enum(AREA_TYPE).nullish().default(null),
    author: zDocumentUUID("Actor").nullish().default(null),
    expended: z.number().min(0).default(0),
    item: zDocumentUUID("Item").nullish().default(null),
    isRegen: z.boolean().default(false),
    options: z.array(z.string()).default([]),
    private: z.boolean().default(false),
    saveVariants: zSaveVariants,
    splashIndex: z.number().default(-1),
    traits: z.array(z.string()).default([]),
    type: z.enum(TARGET_MESSAGE_TYPE),
});

const zDecodeTargetsData = zBaseTargetsData.extend({
    splashTargets: zTokenDocumentArrayDecode,
    targets: zTokenDocumentArrayDecode,
});

const zEncodeTargetsData = zBaseTargetsData.extend({
    splashTargets: zTokenDocumentArrayEncode,
    targets: zTokenDocumentArrayEncode,
});

const zTargetsData = zDecodeTargetsData;

function encodeTargetsData(data: TargetsData, changes?: TargetsDataUpdates): TargetsDataSource {
    const encoded = zEncodeTargetsData.parse(data);
    return changes ? foundry.utils.mergeObject(encoded, changes, { inplace: true }) : encoded;
}

type TargetsDataSource = z.input<typeof zBaseTargetsData> & z.input<typeof zDecodeTargetsData>;
type TargetsData = z.output<typeof zTargetsData>;

type SaveVariantSource = z.input<typeof zSaveVariant>;
type SaveVariant = z.output<typeof zSaveVariant>;

type SaveVariantsSource = z.input<typeof zSaveVariants>;
type SaveVariants = z.output<typeof zSaveVariants>;

type AppliedDamagesSource = z.input<typeof zAppliedDamages>;
type AppliedDamages = z.output<typeof zAppliedDamages>;

type TargetsAppliedDamagesSources = z.input<typeof zTargetsAppliedDamages>;
type TargetsAppliedDamages = z.output<typeof zTargetsAppliedDamages>;

type TargetAppliedDamage = z.output<typeof zAppliedDamages>;

type TargetsDataUpdates = {
    [k in keyof TargetsDataSource]?: TargetsDataSource[k] | ForcedReplacement | ForcedDeletion;
};

export { encodeTargetsData, zSaveVariant, zSaveVariants, zTargetsData, zTokenDocumentArrayDecode };
export type {
    AppliedDamages,
    AppliedDamagesSource,
    SaveVariant,
    SaveVariants,
    SaveVariantSource,
    SaveVariantsSource,
    TargetAppliedDamage,
    TargetsAppliedDamages,
    TargetsAppliedDamagesSources,
    TargetsData,
    TargetsDataSource,
    TargetsDataUpdates,
};
