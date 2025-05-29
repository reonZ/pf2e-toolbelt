import { ArrayField, MODULE, RecordField } from "module-helpers";
import { TargetSaveModel, TargetsSaveModel } from ".";
import fields = foundry.data.fields;
import abstract = foundry.abstract;

const TARGET_MESSAGE_TYPE = ["damage", "spell", "action", "check"] as const;

class TargetsDataModel extends abstract.DataModel<null, TargetsDataSchema> {
    static defineSchema(): TargetsDataSchema {
        return {
            applied: new fields.TypedObjectField(
                new fields.TypedObjectField(new fields.BooleanField()),
                {
                    required: false,
                    nullable: false,
                }
            ),
            item: new fields.DocumentUUIDField({
                required: false,
                nullable: true,
                blank: false,
                initial: null,
            }),
            isRegen: new fields.BooleanField({
                required: false,
                nullable: false,
                initial: false,
            }),
            options: new fields.ArrayField(new fields.StringField(), {
                required: false,
                nullable: false,
                initial: () => [],
            }),
            save: new fields.EmbeddedDataField(TargetsSaveModel, {
                required: false,
                nullable: false,
                initial: undefined,
            }),
            saves: new fields.TypedObjectField(new fields.EmbeddedDataField(TargetSaveModel), {
                required: false,
                nullable: false,
            }),
            splashIndex: new fields.NumberField({
                required: false,
                nullable: false,
                initial: -1,
            }),
            splashTargets: new fields.ArrayField(new fields.StringField(), {
                required: false,
                nullable: false,
                initial: () => [],
            }),
            targets: new fields.ArrayField(new fields.StringField(), {
                required: false,
                nullable: false,
                initial: () => [],
            }),
            traits: new fields.ArrayField(new fields.StringField(), {
                required: false,
                nullable: false,
                initial: () => [],
            }),
            type: new fields.StringField({
                required: true,
                nullable: false,
                blank: false,
                choices: TARGET_MESSAGE_TYPE,
            }),
        };
    }
}

interface TargetsDataModel
    extends abstract.DataModel<null, TargetsDataSchema>,
        ModelPropsFromSchema<TargetsDataSchema> {}

type TargetsDataSchema = {
    applied: RecordField<RecordField<fields.BooleanField, false, false, false>, false>;
    isRegen: fields.BooleanField<boolean, boolean, false, false, true>;
    item: fields.DocumentUUIDField<ItemUUID, false, true, true>;
    options: ArrayField<fields.StringField>;
    save: fields.EmbeddedDataField<TargetsSaveModel, false, false, false>;
    saves: RecordField<
        fields.EmbeddedDataField<TargetSaveModel, false, false, false>,
        false,
        false
    >;
    splashIndex: fields.NumberField<number, number, false, false, true>;
    splashTargets: ArrayField<fields.StringField<TokenDocumentUUID, TokenDocumentUUID>>;
    targets: ArrayField<fields.StringField<TokenDocumentUUID, TokenDocumentUUID>>;
    traits: ArrayField<fields.StringField>;
    type: fields.StringField<TargetMessageType, TargetMessageType, true, false, false>;
};

type TargetMessageType = (typeof TARGET_MESSAGE_TYPE)[number];

type TargetDataSource = SourceFromSchema<TargetsDataSchema>;

MODULE.devExpose({ TargetsDataModel });

export { TargetsDataModel };
export type { TargetDataSource };
