import { ArrayField, MODULE, RecordField } from "module-helpers";
import { TargetsSaveModel, TargetsSaveSource } from ".";
import fields = foundry.data.fields;
import abstract = foundry.abstract;

const TARGET_MESSAGE_TYPE = ["area", "damage", "spell", "action", "check"] as const;

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
            author: new fields.DocumentUUIDField({
                required: false,
                nullable: true,
                type: "Actor",
                initial: null,
            }),
            item: new fields.DocumentUUIDField({
                required: false,
                nullable: true,
                type: "Item",
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
            saveVariants: new fields.TypedObjectField(
                new fields.EmbeddedDataField(TargetsSaveModel),
                {
                    required: false,
                    nullable: false,
                }
            ),
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
    author: fields.DocumentUUIDField<ActorUUID, false, true, true>;
    applied: RecordField<RecordField<fields.BooleanField, false, false, false>, false>;
    isRegen: fields.BooleanField<boolean, boolean, false, false, true>;
    item: fields.DocumentUUIDField<ItemUUID, false, true, true>;
    options: ArrayField<fields.StringField>;
    saveVariants: RecordField<
        fields.EmbeddedDataField<TargetsSaveModel, false, false, false>,
        false
    >;
    splashIndex: fields.NumberField<number, number, false, false, true>;
    splashTargets: ArrayField<fields.StringField<TokenDocumentUUID, TokenDocumentUUID>>;
    targets: ArrayField<fields.StringField<TokenDocumentUUID, TokenDocumentUUID>>;
    traits: ArrayField<fields.StringField>;
    type: fields.StringField<TargetMessageType, TargetMessageType, true, false, false>;
};

type TargetMessageType = (typeof TARGET_MESSAGE_TYPE)[number];

type TargetsDataSource = SourceFromSchema<TargetsDataSchema>;

type SaveVariantsSource = Record<string, WithPartial<TargetsSaveSource, "basic" | "saves">>;

MODULE.devExpose({ TargetsDataModel });

export { TargetsDataModel };
export type { SaveVariantsSource, TargetsDataSource };
