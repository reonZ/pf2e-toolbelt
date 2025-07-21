import { MODULE, RecordField, SAVE_TYPES, SaveType } from "module-helpers";
import fields = foundry.data.fields;
import abstract = foundry.abstract;
import { TargetSaveModel } from "./target-save";

class TargetsSaveModel extends abstract.DataModel<null, TargetsSaveSchema> {
    static defineSchema(): TargetsSaveSchema {
        return {
            basic: new fields.BooleanField({
                required: false,
                nullable: false,
                initial: false,
            }),
            dc: new fields.NumberField({
                required: true,
                nullable: false,
                min: 5,
            }),
            saves: new fields.TypedObjectField(new fields.EmbeddedDataField(TargetSaveModel), {
                required: false,
                nullable: false,
            }),
            statistic: new fields.StringField({
                required: true,
                nullable: false,
                blank: false,
                choices: SAVE_TYPES,
            }),
        };
    }
}

interface TargetsSaveModel
    extends abstract.DataModel<null, TargetsSaveSchema>,
        ModelPropsFromSchema<TargetsSaveSchema> {}

type TargetsSaveSchema = {
    basic: fields.BooleanField<boolean, boolean, false, false, true>;
    dc: fields.NumberField<number, number, true, false, false>;
    saves: RecordField<
        fields.EmbeddedDataField<TargetSaveModel, false, false, false>,
        false,
        false
    >;
    statistic: fields.StringField<SaveType, SaveType, true, false, false>;
};

type TargetsSaveSource = SourceFromSchema<TargetsSaveSchema>;

MODULE.devExpose({ TargetsSaveModel });

export { TargetsSaveModel };
export type { TargetsSaveSource };
