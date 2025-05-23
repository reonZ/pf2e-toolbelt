import {
    ArrayField,
    ChatMessageSourcePF2e,
    DEGREE_STRINGS,
    DegreeOfSuccessString,
    MODULE,
} from "module-helpers";
import fields = foundry.data.fields;
import abstract = foundry.abstract;

class MessageDataModel extends abstract.DataModel<null, MessageDataSchema> {
    static defineSchema(): MessageDataSchema {
        return {
            modifiers: new fields.StringField({
                required: false,
                nullable: false,
                blank: true,
                initial: "",
            }),
            name: new fields.StringField({
                required: false,
                nullable: false,
                blank: false,
                initial: "unknown",
            }),
            notes: new fields.ArrayField(new fields.StringField(), {
                required: false,
                nullable: false,
                initial: () => [],
            }),
            options: new fields.ArrayField(new fields.StringField(), {
                required: false,
                nullable: false,
                initial: () => [],
            }),
            outcome: new fields.StringField({
                required: false,
                blank: false,
                nullable: true,
                choices: DEGREE_STRINGS,
            }),
            source: new fields.ObjectField(),
            tags: new fields.StringField({
                required: false,
                nullable: false,
                blank: true,
                initial: "",
            }),
        };
    }
}

interface MessageDataModel
    extends abstract.DataModel<null, MessageDataSchema>,
        ModelPropsFromSchema<MessageDataSchema> {}

type MessageDataSchema = {
    modifiers: fields.StringField<string, string>;
    name: fields.StringField<string, string>;
    notes: ArrayField<fields.StringField>;
    options: ArrayField<fields.StringField>;
    outcome: fields.StringField<DegreeOfSuccessString, DegreeOfSuccessString, false, true, true>;
    source: fields.ObjectField<ChatMessageSourcePF2e, DeepPartial<ChatMessageSourcePF2e>>;
    tags: fields.StringField<string, string>;
};

MODULE.devExpose({ MessageDataModel });

export { MessageDataModel };
