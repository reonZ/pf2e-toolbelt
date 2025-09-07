import { LevelField } from "module-helpers";
import { BaseFilterSchema, generateBaseFilterFields, IMerchantFilter } from ".";
import { ServiceModel } from "..";
import fields = foundry.data.fields;

class ServiceFilterModel
    extends foundry.abstract.DataModel<null, ServiceFilterSchema>
    implements IMerchantFilter<ServiceModel>
{
    static defineSchema(): ServiceFilterSchema {
        return {
            ...generateBaseFilterFields(),
            level: new LevelField(),
            tag: new fields.StringField({
                required: false,
                nullable: false,
                blank: true,
                trim: true,
                initial: "",
            }),
        };
    }

    testFilter(service: ServiceModel): boolean {
        return (
            this.enabled &&
            service.level >= this.level &&
            (!this.tag || service.tags.includes(this.tag))
        );
    }

    protected _initializeSource(
        data: object,
        options?: DataModelConstructionOptions<null> | undefined
    ): this["_source"] {
        const source = super._initializeSource(data, options);

        source.tag = source.tag.toLocaleLowerCase(game.i18n.lang);

        return source;
    }
}

interface ServiceFilterModel extends ModelPropsFromSchema<ServiceFilterSchema> {}

type ServiceFilterSchema = BaseFilterSchema & {
    level: LevelField;
    tag: fields.StringField<string, string, false, false, true>;
};

export { ServiceFilterModel };
