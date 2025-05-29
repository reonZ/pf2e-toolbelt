import { MODULE, SAVE_TYPES, SaveType } from "module-helpers";
import fields = foundry.data.fields;
import abstract = foundry.abstract;

class TargetsSaveModel extends abstract.DataModel<null, TargetsSaveSchema> {
    static defineSchema(): TargetsSaveSchema {
        return {
            author: new fields.DocumentUUIDField({
                required: false,
                nullable: true,
                blank: false,
                initial: null,
            }),
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
    author: fields.DocumentUUIDField<ActorUUID, false, true, true>;
    basic: fields.BooleanField<boolean, boolean, false, false, true>;
    dc: fields.NumberField<number, number, true, false, false>;
    statistic: fields.StringField<SaveType, SaveType, true, false, false>;
};

MODULE.devExpose({ TargetsSaveModel });

export { TargetsSaveModel };
