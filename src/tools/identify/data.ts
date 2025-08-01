import fields = foundry.data.fields;

class IdentifiedItemModel extends foundry.abstract.DataModel<null, IdentifiedItemSchema> {
    static defineSchema(): IdentifiedItemSchema {
        return {
            itemName: new fields.StringField({
                required: false,
                nullable: true,
                blank: false,
                initial: undefined,
            }),
            itemSlug: new fields.StringField({
                required: true,
                nullable: false,
                blank: false,
            }),
            partialSlug: new fields.StringField({
                required: false,
                nullable: true,
                blank: false,
                initial: undefined,
            }),
        };
    }
}

interface IdentifiedItemModel extends ModelPropsFromSchema<IdentifiedItemSchema> {}

type IdentifiedItemSchema = {
    itemName: fields.StringField<string, string, false, true, false>;
    itemSlug: fields.StringField<string, string, true, false, false>;
    partialSlug: fields.StringField<string, string, false, true, false>;
};

type IdentifiedItemSource = SourceFromSchema<IdentifiedItemSchema>;

export { IdentifiedItemModel };
export type { IdentifiedItemSource };
