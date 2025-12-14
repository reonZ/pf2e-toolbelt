import { CheckType, DEGREE_STRINGS, DegreeOfSuccessString, MODULE } from "module-helpers";
import fields = foundry.data.fields;

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

class UserRollModel extends foundry.abstract.DataModel<null, UserRollSchema> {
    static defineSchema(): UserRollSchema {
        return {
            actor: new fields.DocumentUUIDField({
                required: false,
                nullable: true,
                type: "Actor",
            }),
            encounter: new fields.StringField({
                required: false,
                nullable: true,
                blank: false,
                initial: undefined,
            }),
            isPrivate: new fields.BooleanField({
                required: false,
                nullable: false,
            }),
            isReroll: new fields.BooleanField({
                required: false,
                nullable: false,
            }),
            modifier: new fields.StringField({
                required: false,
                nullable: true,
                blank: false,
                initial: undefined,
            }),
            outcome: new fields.StringField({
                required: false,
                blank: false,
                nullable: true,
                choices: DEGREE_STRINGS,
            }),
            session: new fields.StringField({
                required: false,
                nullable: true,
                blank: false,
                initial: undefined,
            }),
            time: new fields.NumberField({
                required: true,
                nullable: false,
            }),
            type: new fields.StringField({
                required: true,
                nullable: false,
                blank: false,
                choices: ROLL_TYPES,
            }),
            value: new fields.NumberField({
                required: true,
                nullable: false,
            }),
        };
    }
}

interface UserRollModel extends UserRoll {}

type UserRollSchema = {
    actor: fields.DocumentUUIDField<ActorUUID, false, true, true>;
    encounter: fields.StringField<string, string, false, true, true>;
    isPrivate: fields.BooleanField<boolean, boolean, false, false, true>;
    isReroll: fields.BooleanField<boolean, boolean, false, false, true>;
    modifier: fields.StringField<string, string, false, true, true>;
    outcome: fields.StringField<DegreeOfSuccessString, DegreeOfSuccessString, false, true, true>;
    session: fields.StringField<string, string, false, true, true>;
    time: fields.NumberField<number, number, true, false, false>;
    type: fields.StringField<RollType, RollType, true, false, false>;
    value: fields.NumberField<number, number, true, false, false>;
};

type UserRoll = WithPartial<
    ModelPropsFromSchema<UserRollSchema>,
    "actor" | "encounter" | "modifier" | "outcome" | "session"
>;

type RollType = (typeof ROLL_TYPES)[number];

MODULE.devExpose({ UserRollModel });

export { UserRollModel };
export type { RollType, UserRoll };
