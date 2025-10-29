import { LevelField } from "module-helpers";
import {
    BaseFilterSchema,
    CalulatedFilterPrice,
    DefaultFilterModel,
    generateBaseFilterFields,
    IMerchantFilter,
} from ".";
import { ServiceModel } from "..";
import fields = foundry.data.fields;

class ServiceDefaultFilterModel extends DefaultFilterModel<ServiceModel> {
    calculatePrice(service: ServiceModel): CalulatedFilterPrice {
        return calculateServicePrice(this, service);
    }
}

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

    getRatio(entry: ServiceModel): number {
        return this.ratio;
    }

    calculatePrice(service: ServiceModel): CalulatedFilterPrice {
        return calculateServicePrice(this, service);
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

function calculateServicePrice(
    filter: ServiceDefaultFilterModel | ServiceFilterModel,
    service: ServiceModel
): CalulatedFilterPrice {
    const original = service.enrichedPrice;
    const ratio = filter?.getRatio(service) ?? 1;

    return {
        original,
        ratio,
        value: ratio === 1 ? original : original.scale(ratio),
    };
}

interface ServiceFilterModel extends ModelPropsFromSchema<ServiceFilterSchema> {}

type ServiceFilterSchema = BaseFilterSchema & {
    level: LevelField;
    tag: fields.StringField<string, string, false, false, true>;
};

export { ServiceDefaultFilterModel, ServiceFilterModel };
