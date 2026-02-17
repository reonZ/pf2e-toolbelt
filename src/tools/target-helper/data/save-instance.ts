import { SAVE_TYPES, z } from "foundry-helpers";
import { DEGREE_ADJUSTMENT_AMOUNTS, DEGREE_OF_SUCCESS_STRINGS } from "foundry-helpers/dist";

const ADJUSTMENT_TYPES = ["all", ...DEGREE_OF_SUCCESS_STRINGS] as const;
const REROLL_TYPES = ["hero", "mythic", "new", "lower", "higher"] as const;
const VISIBILITY_TYPES = ["all", "none", "gm", "owner"] as const;

const zAdjustement = z.object({
    label: z.string(),
    amount: z.enum(DEGREE_ADJUSTMENT_AMOUNTS),
});

const zModifier = z.object({
    excluded: z.boolean().default(false),
    label: z.string().trim().min(1),
    modifier: z.number(),
    slug: z.string().trim().min(1),
});

const zNote = z.object({
    selector: z.string(),
    title: z.string().trim().min(1).nullish(),
    text: z.string().trim().min(1),
    predicate: z.any().optional(),
    outcome: z.array(z.enum(DEGREE_OF_SUCCESS_STRINGS)).default([]),
    visibility: z.enum(VISIBILITY_TYPES).nullish(),
});

const zSignificantModifier = z.object({
    appliedTo: z.enum(["roll", "dc"]),
    name: z.string(),
    significance: z.enum(["ESSENTIAL", "HELPFUL", "NONE", "HARMFUL", "DETRIMENTAL"]),
    sourceUuid: z.string(),
    value: z.number(),
});

const zTargetSaveInstance = z.object({
    die: z.number().min(1).max(20),
    dosAdjustments: z.partialRecord(z.enum(ADJUSTMENT_TYPES), zAdjustement).default({}),
    modifiers: z.array(zModifier).default([]),
    notes: z.array(zNote).default([]),
    private: z.boolean().default(false),
    rerolled: z.enum(REROLL_TYPES).optional(),
    roll: z.string().trim().min(1),
    significantModifiers: z.array(zSignificantModifier).default([]),
    statistic: z.enum(SAVE_TYPES),
    success: z.enum(DEGREE_OF_SUCCESS_STRINGS),
    unadjustedOutcome: z.enum(DEGREE_OF_SUCCESS_STRINGS).nullish().default(null),
    value: z.number(),
});

type TargetSaveInstanceSource = z.input<typeof zTargetSaveInstance>;
type TargetSaveInstance = z.output<typeof zTargetSaveInstance>;

type SaveInstanceModifierSource = z.input<typeof zModifier>;
type SaveInstanceModifier = z.output<typeof zModifier>;

type RerollType = (typeof REROLL_TYPES)[number];

export { zTargetSaveInstance };
export type {
    RerollType,
    SaveInstanceModifier,
    SaveInstanceModifierSource,
    TargetSaveInstance,
    TargetSaveInstanceSource,
};
