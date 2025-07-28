import {
    ModelPropFromDataField,
    PhysicalItemTrait,
    R,
    SourcePropFromDataField,
} from "module-helpers";
import fields = foundry.data.fields;

class CheckboxDataField<
    TRequired extends boolean = true,
    TNullable extends boolean = false,
    THasInitial extends boolean = true,
    TSourceProp extends SourceFromSchema<CheckboxDataSchema> = SourceFromSchema<CheckboxDataSchema>
> extends fields.SchemaField<
    CheckboxDataSchema,
    TSourceProp,
    ModelPropsFromSchema<CheckboxDataSchema>,
    TRequired,
    TNullable,
    THasInitial
> {
    constructor(
        options?: fields.DataFieldOptions<TSourceProp, TRequired, TNullable, THasInitial>,
        context?: fields.DataFieldContext
    ) {
        super(
            {
                options: new fields.SchemaField<CheckboxOptionSchema>({
                    selected: new fields.BooleanField(),
                }),
                selected: new fields.ArrayField(new fields.StringField()),
            },
            options,
            context
        );
    }
}

class TraitDataSelectionField<
    TElementField extends fields.SchemaField<TraitDataSelectionSchema> = fields.SchemaField<TraitDataSelectionSchema>
> extends fields.ArrayField<
    TElementField,
    SourcePropFromDataField<TElementField>[],
    ModelPropFromDataField<TElementField>[],
    false,
    false,
    true
> {
    static get _defaults() {
        return Object.assign(super._defaults, {
            required: false,
            nullable: false,
        });
    }

    constructor(
        options?: fields.ArrayFieldOptions<
            SourcePropFromDataField<TElementField>[],
            false,
            false,
            true
        >,
        context?: fields.DataFieldContext
    ) {
        super(
            new fields.SchemaField({
                not: new fields.BooleanField(),
                value: new fields.StringField({
                    blank: false,
                    choices: () => getPhysicalTraits(),
                }),
            }) as TElementField,
            options,
            context
        );
    }

    getInitialValue(data?: object) {
        return super.getInitialValue(data) ?? ([] as any);
    }
}

let _cachedTraits: PhysicalItemTrait[] | undefined;
function getPhysicalTraits(): PhysicalItemTrait[] {
    return (_cachedTraits ??= R.keys({
        ...CONFIG.PF2E.armorTraits,
        ...CONFIG.PF2E.consumableTraits,
        ...CONFIG.PF2E.equipmentTraits,
        ...CONFIG.PF2E.shieldTraits,
        ...CONFIG.PF2E.weaponTraits,
    }));
}

type CheckboxDataSchema = {
    options: fields.SchemaField<CheckboxOptionSchema>;
    selected: fields.ArrayField<fields.StringField>;
};

type CheckboxOptionSchema = {
    selected: fields.BooleanField;
};

type TraitDataSelectionSchema = {
    not: fields.BooleanField;
    value: fields.StringField<PhysicalItemTrait, PhysicalItemTrait>;
};

export { CheckboxDataField, TraitDataSelectionField };
