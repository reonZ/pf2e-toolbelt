import { R, TokenDocumentPF2e, z, zClientDocument, zDocumentUUID } from "foundry-helpers";
import { zTargetSaveInstance } from ".";

const TARGET_MESSAGE_TYPE = ["area", "damage", "spell", "action", "check"] as const;

const zTokenDocument = z.codec(zDocumentUUID("Token"), zClientDocument("Token").nullable(), {
    decode: (uuid) => fromUuidSync(uuid) as TokenDocumentPF2e,
    encode: (token) => (token as TokenDocumentPF2e).uuid,
});

const zTokenDocumentArray = z
    .array(zTokenDocument)
    .transform((tokens) => tokens.filter(R.isTruthy))
    .default([]);

const zBaseTargetsData = z.object({
    applied: z.record(z.string(), z.record(z.string(), z.boolean()).default({})).default({}),
    author: zDocumentUUID("Actor").nullish().default(null),
    item: zDocumentUUID("Item").nullish().default(null),
    isRegen: z.boolean().default(false),
    options: z.array(z.string()).default([]),
    private: z.boolean().default(false),
    saveVariants: z.record(z.string(), zTargetSaveInstance).default({}),
    splashIndex: z.number().default(-1),
    traits: z.array(z.string()).default([]),
    type: z.enum(TARGET_MESSAGE_TYPE),
});

const zDecodeTargetsData = zBaseTargetsData.extend({
    splashTargets: zTokenDocumentArray,
    targets: zTokenDocumentArray,
});

const zEncodeTargetsData = zBaseTargetsData.extend({
    splashTargets: z.array(zTokenDocument).default([]),
    targets: z.array(zTokenDocument).default([]),
});

const zTargetsData = zDecodeTargetsData.transform((data) => {
    Object.defineProperty(data, "encode", {
        value: () => zEncodeTargetsData.encode(data),
    });
    return data as typeof data & { encode(): TargetsDataSource };
});

type TargetsDataSource = z.input<typeof zBaseTargetsData> & z.input<typeof zDecodeTargetsData>;
type TargetsData = z.output<typeof zTargetsData>;

export { zTargetsData, zEncodeTargetsData };
export type { TargetsData, TargetsDataSource };
