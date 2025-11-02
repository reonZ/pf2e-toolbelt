import { FeatOrFeatureCategory, ModelPropFromDataField, OneToTen, R } from "module-helpers";
import fields = foundry.data.fields;
import abstract = foundry.abstract;

class ImportSchemaField<
    TDataSchema extends fields.DataSchema = fields.DataSchema
> extends fields.SchemaField<
    TDataSchema,
    SourceFromSchema<TDataSchema>,
    ModelPropsFromSchema<TDataSchema>,
    false,
    false,
    true
> {
    static get _defaults() {
        return Object.assign(super._defaults, { required: false });
    }
}

class ImportDataModel extends abstract.DataModel<null, ImportDataSchema> {
    static get coreEntries() {
        return ["ancestry", "heritage", "background", "class"] as const;
    }

    static get featCategories() {
        return R.keys(CONFIG.PF2E.featCategories);
    }

    get coreEntries() {
        return ImportDataModel.coreEntries;
    }

    get entries() {
        return [...this.coreEntries, "feats"] as const;
    }

    static defineSchema(): ImportDataSchema {
        return {
            name: new fields.StringField(),
            feats: new fields.ArrayField(
                new ImportSchemaField({
                    ...createEntryFieldData(),
                    level: new fields.NumberField({
                        required: true,
                        nullable: false,
                        min: 1,
                        max: 10,
                        step: 1,
                    }),
                    category: new fields.StringField({
                        required: true,
                        nullable: false,
                        blank: false,
                        choices: ImportDataModel.featCategories,
                    }),
                    parent: new fields.StringField({
                        validate: (value) => {
                            if (!R.isString(value) || !value.trim()) return false;
                            return (
                                R.isIncludedIn(value, ImportDataModel.coreEntries) ||
                                !isNaN(Number(value))
                            );
                        },
                    }),
                })
            ),
            ...R.pipe(
                ImportDataModel.coreEntries,
                R.map((key) => [key, new ImportSchemaField(createEntryFieldData())] as const),
                R.mapToObj(([key, field]) => [key, field])
            ),
        };
    }

    getFeat(index: unknown): ImportFeatEntry | undefined {
        const i = Number(index);
        return i.between(1, 10) ? this.feats.at(i) : undefined;
    }
}

interface ImportDataModel extends ModelPropsFromSchema<ImportDataSchema> {}

function createEntryFieldData(): EntryImportFieldSchema {
    return {
        value: new fields.StringField(),
        match: new fields.DocumentUUIDField({
            required: false,
            nullable: true,
            initial: undefined,
        }),
        override: new fields.DocumentUUIDField({
            required: false,
            nullable: false,
            initial: undefined,
        }),
    };
}

type ImportDataSource = DeepPartial<SourceFromSchema<ImportDataSchema>>;

type ImportDataEntrySource = SourceFromSchema<EntryImportFieldSchema>;
type ImportDataFeatEntrySource = SourceFromSchema<FeatEntryImportFieldSchema>;

type ImportEntry = ModelPropsFromSchema<EntryImportFieldSchema>;
type ImportFeatEntry = ModelPropsFromSchema<FeatEntryImportFieldSchema>;

type EntryImportData = ModelPropFromDataField<EntryImportField>;

type EntryImportField = ImportSchemaField<EntryImportFieldSchema>;

type EntryImportFieldSchema = {
    match: fields.DocumentUUIDField<ItemUUID, false, true, true>;
    override: fields.DocumentUUIDField<ItemUUID, false, false, true>;
    value: fields.StringField;
};

type FeatEntryImportField = ImportSchemaField<FeatEntryImportFieldSchema>;

type FeatEntryImportFieldSchema = EntryImportFieldSchema & {
    category: fields.StringField<FeatOrFeatureCategory, FeatOrFeatureCategory, true, false, false>;
    level: fields.NumberField<OneToTen, OneToTen, true, false, false>;
    parent: fields.StringField;
};

type ImportDataSchema = {
    ancestry: EntryImportField;
    background: EntryImportField;
    class: EntryImportField;
    feats: fields.ArrayField<FeatEntryImportField>;
    heritage: EntryImportField;
    name: fields.StringField;
};

type ImportDataCoreKey = (typeof ImportDataModel)["coreEntries"][number];

export { ImportDataModel };
export type {
    EntryImportData,
    ImportDataCoreKey,
    ImportDataEntrySource,
    ImportDataFeatEntrySource,
    ImportDataSource,
    ImportEntry,
    ImportFeatEntry,
};
