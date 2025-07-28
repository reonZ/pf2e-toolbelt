import { PhysicalItemPF2e } from "module-helpers";
import { CheckboxDataField, TraitDataSelectionField } from ".";
import {
    BaseFilterSchema,
    DefaultFilterModel,
    DefaultFilterSchema,
    generateBaseFilterFields,
    generateDefaultFilterFields,
    IMerchantFilter,
} from "..";
import fields = foundry.data.fields;

class BuyDefaultFilterModel extends DefaultFilterModel {
    static defineSchema(): DefaultFilterSchema {
        return generateDefaultFilterFields(0.5);
    }
}

class ItemFilterModel
    extends foundry.abstract.DataModel<null, ItemFilterSchema>
    implements IMerchantFilter<PhysicalItemPF2e>
{
    static defineSchema(): ItemFilterSchema {
        return {
            ...generateBaseFilterFields(),
            filter: new fields.SchemaField({
                checkboxes: new fields.SchemaField<CheckboxesSchema>({
                    armorTypes: new CheckboxDataField(),
                    itemTypes: new CheckboxDataField(),
                    rarity: new CheckboxDataField(),
                    weaponTypes: new CheckboxDataField(),
                }),
                level: new fields.SchemaField<LevelDataSchema>({
                    changed: new fields.BooleanField(),
                    from: new fields.NumberField(),
                    to: new fields.NumberField(),
                }),
                ranges: new fields.SchemaField<RangesSchema>({
                    price: new fields.SchemaField<RangesInputDataSchema>({
                        changed: new fields.BooleanField(),
                        values: new fields.SchemaField<RangesInputDataValuesSchema>({
                            min: new fields.NumberField(),
                            max: new fields.NumberField(),
                            inputMin: new fields.StringField(),
                            inputMax: new fields.StringField(),
                        }),
                    }),
                }),
                search: new fields.SchemaField<SearchSchema>({
                    text: new fields.StringField(),
                }),
                source: new CheckboxDataField(),
                traits: new fields.SchemaField<TraitDataSchema>({
                    conjunction: new fields.StringField({
                        blank: false,
                        choices: () => ["and", "or"],
                    }),
                    selected: new TraitDataSelectionField(),
                }),
            }),
        };
    }

    testFilter(item: PhysicalItemPF2e): boolean {
        return this.enabled;
    }
}

interface ItemFilterModel extends ModelPropsFromSchema<ItemFilterSchema> {}

type ItemFilterSchema = BaseFilterSchema & {
    filter: fields.SchemaField<EquipmentFilterSchema>;
};

type EquipmentFilterSchema = {
    checkboxes: fields.SchemaField<CheckboxesSchema>;
    level: fields.SchemaField<LevelDataSchema>;
    ranges: fields.SchemaField<RangesSchema>;
    source: CheckboxDataField;
    search: fields.SchemaField<SearchSchema>;
    traits: fields.SchemaField<TraitDataSchema>;
};

type SearchSchema = {
    text: fields.StringField;
};

type RangesSchema = {
    price: fields.SchemaField<RangesInputDataSchema>;
};

type RangesInputDataSchema = {
    changed: fields.BooleanField;
    values: fields.SchemaField<RangesInputDataValuesSchema>;
};

type RangesInputDataValuesSchema = {
    min: fields.NumberField;
    max: fields.NumberField;
    inputMin: fields.StringField;
    inputMax: fields.StringField;
};

type TraitDataSchema = {
    conjunction: fields.StringField<"and" | "or", "and" | "or">;
    selected: TraitDataSelectionField;
};

type CheckboxesSchema = {
    armorTypes: CheckboxDataField;
    itemTypes: CheckboxDataField;
    rarity: CheckboxDataField;
    weaponTypes: CheckboxDataField;
};

type LevelDataSchema = {
    changed: fields.BooleanField;
    from: fields.NumberField;
    to: fields.NumberField;
};

export { BuyDefaultFilterModel, ItemFilterModel };
