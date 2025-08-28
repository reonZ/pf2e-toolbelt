import {
    ArrayField,
    DEGREE_STRINGS,
    DegreeAdjustmentAmount,
    DegreeOfSuccessString,
    MODULE,
    RecordField,
    RollNoteSource,
    SAVE_TYPES,
    SaveType,
} from "module-helpers";
import fields = foundry.data.fields;
import abstract = foundry.abstract;

const REROLL_TYPE = ["hero", "mythic", "new", "lower", "higher"] as const;

class TargetSaveModel extends abstract.DataModel<null, TargetSaveSchema> {
    static defineSchema(): TargetSaveSchema {
        return {
            die: new fields.NumberField({
                required: true,
                nullable: false,
                min: 1,
                max: 20,
            }),
            dosAdjustments: new fields.TypedObjectField(
                new fields.ObjectField<DegreeAdjustments>(),
                {
                    required: false,
                    nullable: false,
                    initial: () => ({}),
                }
            ),
            modifiers: new fields.ArrayField(
                new fields.SchemaField({
                    excluded: new fields.BooleanField({
                        required: false,
                        nullable: false,
                        initial: false,
                    }),
                    label: new fields.StringField({
                        required: true,
                        nullable: false,
                        blank: false,
                    }),
                    modifier: new fields.NumberField({
                        required: true,
                        nullable: false,
                    }),
                    slug: new fields.StringField({
                        required: true,
                        nullable: false,
                        blank: false,
                    }),
                }),
                {
                    required: false,
                    nullable: false,
                    initial: () => [],
                }
            ),
            notes: new fields.ArrayField(new fields.ObjectField(), {
                required: false,
                nullable: false,
                initial: () => [],
            }),
            private: new fields.BooleanField({
                required: false,
                nullable: false,
                initial: false,
            }),
            rerolled: new fields.StringField({
                required: false,
                nullable: false,
                blank: false,
                initial: undefined,
                choices: REROLL_TYPE,
            }),
            roll: new fields.StringField({
                required: true,
                nullable: false,
                blank: false,
            }),
            significantModifiers: new fields.ArrayField(new fields.ObjectField(), {
                required: false,
                nullable: false,
                initial: () => [],
            }),
            statistic: new fields.StringField({
                required: true,
                nullable: false,
                blank: false,
                choices: SAVE_TYPES,
            }),
            success: new fields.StringField({
                required: true,
                blank: false,
                nullable: false,
                choices: DEGREE_STRINGS,
            }),
            unadjustedOutcome: new fields.StringField({
                required: false,
                blank: false,
                nullable: true,
                choices: DEGREE_STRINGS,
                initial: null,
            }),
            value: new fields.NumberField({
                required: true,
                nullable: false,
            }),
        };
    }
}

interface TargetSaveModel
    extends abstract.DataModel<null, TargetSaveSchema>,
        ModelPropsFromSchema<TargetSaveSchema> {}

type TargetSaveSchema = {
    die: fields.NumberField<number, number, true, false, false>;
    dosAdjustments: RecordField<fields.ObjectField<DegreeAdjustments>, false, false, true>;
    modifiers: fields.ArrayField<fields.SchemaField<TargetSaveModifier>>;
    notes: fields.ArrayField<fields.ObjectField<RollNoteSource, RollNoteSource>>;
    private: fields.BooleanField<boolean, boolean, false, false, true>;
    rerolled: fields.StringField<RerollType, RerollType, false, false, false>;
    roll: fields.StringField<string, string, true, false, false>;
    significantModifiers: ArrayField<
        fields.ObjectField<
            modifiersMatter.SignificantModifier,
            modifiersMatter.SignificantModifier
        >,
        false,
        false,
        true
    >;
    statistic: fields.StringField<SaveType, SaveType, true, false, false>;
    success: fields.StringField<DegreeOfSuccessString, DegreeOfSuccessString, true, false, false>;
    unadjustedOutcome: fields.StringField<
        DegreeOfSuccessString,
        DegreeOfSuccessString,
        false,
        true,
        true
    >;
    value: fields.NumberField<number, number, true, false, false>;
};

type TargetSaveModifier = {
    excluded: fields.BooleanField<boolean, boolean, false, false, true>;
    label: fields.StringField<string, string, true, false, false>;
    modifier: fields.NumberField<number, number, true, false, false>;
    slug: fields.StringField<string, string, true, false, false>;
};

type DegreeAdjustments = {
    label: string;
    amount: DegreeAdjustmentAmount;
};

type RerollType = (typeof REROLL_TYPE)[number];

MODULE.devExpose({ TargetSaveModel });

export { TargetSaveModel };
export type { RerollType };
