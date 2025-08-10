import fields = foundry.data.fields;
import abstract = foundry.abstract;

class HeroActionModel extends abstract.DataModel<null, HeroActionSchema> {
    static defineSchema(): HeroActionSchema {
        return {
            name: new fields.StringField({
                required: true,
                nullable: false,
                blank: false,
            }),
            uuid: new fields.DocumentUUIDField({
                required: true,
                nullable: false,
            }),
        };
    }
}

interface HeroActionModel extends ModelPropsFromSchema<HeroActionSchema> {}

type HeroActionSchema = {
    name: fields.StringField<string, string, true, false, false>;
    uuid: fields.DocumentUUIDField<DocumentUUID, true, false, false>;
};

type HeroActionSource = SourceFromSchema<HeroActionSchema>;

export { HeroActionModel };
export type { HeroActionSource };
