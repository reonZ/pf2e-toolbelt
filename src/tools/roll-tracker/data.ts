import { CheckType, z } from "foundry-helpers";
import { DEGREE_OF_SUCCESS_STRINGS } from "foundry-helpers/dist";

const ROLL_TYPES: (CheckType | "roll")[] = [
    "attack-roll",
    "check",
    "counteract-check",
    "flat-check",
    "initiative",
    "perception-check",
    "roll",
    "saving-throw",
    "skill-check",
] as const;

const zUserRoll = z.object({
    actor: z.string().trim().refine(foundry.data.validators.isValidId).nullish(),
    encounter: z.string().nullish(),
    isPrivate: z.boolean().default(false),
    isReroll: z.boolean().default(false),
    modifier: z.string().trim().min(1).nullish(),
    outcome: z.enum(DEGREE_OF_SUCCESS_STRINGS).nullish(),
    session: z.string().trim().min(1).nullish(),
    time: z.number(),
    type: z.enum(ROLL_TYPES),
    value: z.number(),
});

const zTimedEvents = z.record(z.string(), z.number());

type RollType = (typeof ROLL_TYPES)[number];

type UserRollSource = z.input<typeof zUserRoll>;
type UserRoll = z.output<typeof zUserRoll>;

export { zTimedEvents, zUserRoll };
export type { RollType, UserRoll, UserRollSource };
