import { IdField } from "module-helpers";
import fields = foundry.data.fields;
import abstract = foundry.abstract;

function generateDefaultFilterFields(ratio: number = 1): DefaultFilterSchema {
    return {
        enabled: new fields.BooleanField({
            required: false,
            nullable: false,
            initial: true,
        }),
        ratio: new fields.NumberField({
            required: false,
            nullable: false,
            initial: ratio,
            min: 0,
            max: 10,
            step: 0.01,
        }),
    };
}

function generateBaseFilterFields(ratio: number = 1): BaseFilterSchema {
    return {
        ...generateDefaultFilterFields(ratio),
        id: new IdField(),
        name: new fields.StringField({
            required: false,
            nullable: false,
            blank: true,
            initial: "",
        }),
    };
}

class DefaultFilterModel extends abstract.DataModel<null, DefaultFilterSchema> {
    static defineSchema(): DefaultFilterSchema {
        return generateDefaultFilterFields();
    }

    get id(): string {
        return "default";
    }

    get name(): string {
        return game.i18n.localize("Default");
    }

    testFilter() {
        return this.enabled;
    }
}

interface DefaultFilterModel extends ModelPropsFromSchema<DefaultFilterSchema> {}

type DefaultFilterSchema = {
    enabled: fields.BooleanField<boolean, boolean, false, false, true>;
    ratio: fields.NumberField<number, number, false, false, true>;
};

type BaseFilterSchema = DefaultFilterSchema & {
    id: IdField;
    name: fields.StringField<string, string, false, false, true>;
};

interface IMerchantFilter<T extends abstract.DataModel> {
    testFilter: (instance: T) => boolean;
}

export { DefaultFilterModel, generateBaseFilterFields, generateDefaultFilterFields };
export type { BaseFilterSchema, DefaultFilterSchema, IMerchantFilter };
