import {
    AttributeString,
    CharacterPF2e,
    createRecordFieldStringKey,
    FeatOrFeatureCategory,
    FeatPF2e,
    getItemSlug,
    ItemPF2e,
    KeyedRecordField,
    ModelPropFromDataField,
    R,
    RecordFieldStringKey,
    SchemaField,
    sluggify,
} from "module-helpers";
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
    static coreEntries = ["ancestry", "heritage", "background", "class"] as const;
    static allEntries = [...this.coreEntries, "feats"] as const;
    static attributeKeys = ["str", "dex", "con", "int", "wis", "cha"] as const;
    static attributeLevels = ["1", "5", "10", "15", "20"] as const;

    static get featCategories() {
        return R.keys(CONFIG.PF2E.featCategories);
    }

    static defineSchema(): ImportDataSchema {
        return {
            name: new fields.StringField(),
            attributes: new fields.SchemaField(
                {
                    ancestry: new fields.SchemaField({
                        boosts: createBoostField(),
                        flaws: createBoostField(),
                    }),
                    background: createBoostField(),
                    class: createBoostField(),
                    levels: new KeyedRecordField(
                        createRecordFieldStringKey({ choices: ImportDataModel.attributeLevels }),
                        new fields.ArrayField(
                            new fields.StringField({
                                nullable: false,
                                blank: false,
                                choices: ImportDataModel.attributeKeys,
                            })
                        )
                    ),
                    values: new KeyedRecordField(
                        createRecordFieldStringKey({ choices: ImportDataModel.attributeKeys }),
                        new fields.NumberField({
                            nullable: false,
                            step: 1,
                        })
                    ),
                },
                {
                    required: false,
                    nullable: false,
                }
            ),
            feats: new fields.ArrayField(
                new ImportSchemaField({
                    ...createEntryField(),
                    level: new fields.NumberField({
                        required: true,
                        nullable: false,
                        min: 1,
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
                            return ImportDataModel.isCoreEntry(value) || !isNaN(Number(value));
                        },
                    }),
                })
            ),
            level: new fields.NumberField({
                required: true,
                nullable: false,
                min: 1,
                step: 1,
            }),
            ...R.pipe(
                ImportDataModel.coreEntries,
                R.map((key) => [key, new ImportSchemaField(createEntryField())] as const),
                R.mapToObj(([key, field]) => [key, field])
            ),
        };
    }

    static isValidEntry(value: unknown): value is ImportDataEntryKey {
        return R.isString(value) && R.isIncludedIn(value, ImportDataModel.allEntries);
    }

    static isCoreEntry(value: unknown): value is ImportDataCoreKey {
        return R.isString(value) && R.isIncludedIn(value, ImportDataModel.coreEntries);
    }

    static getSelection(entry: ImportEntry, doc: true): Promise<ItemPF2e | null>;
    static getSelection(entry: ImportEntry, doc?: boolean): CompendiumIndexData | null;
    static getSelection(entry: ImportEntry, doc?: boolean) {
        const uuid = entry.override ?? entry.match;
        if (!uuid) return null;

        return doc ? fromUuid<ItemPF2e>(uuid) : fromUuidSync<CompendiumIndexData>(uuid);
    }

    getEntry(itemType: "feat", index?: number | string): ImportFeatEntry | undefined;
    getEntry<T extends ImportDataEntryKey>(itemType: ImportDataCoreKey): ImportEntry | undefined;
    getEntry(itemType: string, index?: number | string): ImportEntry | undefined;
    getEntry(itemType: string, index?: number | string) {
        if (itemType === "feat") {
            const num = R.isString(index) ? Number(index.trim() || -1) : index;
            return R.isNumber(num) ? this.feats.at(num) : undefined;
        }
        return ImportDataModel.isCoreEntry(itemType) ? this[itemType] : undefined;
    }

    getCurrentFeat(
        actor: CharacterPF2e,
        entry: ImportFeatEntry,
        matchLevel: boolean
    ): ItemPF2e | null {
        const selection = ImportDataModel.getSelection(entry);
        if (!selection) return null;

        const actorLevel = actor.level;
        const selectionUUID = selection.uuid;
        const selectionSlug = getItemSlug(selection);
        const sourceUUID = entry.match !== selectionUUID ? entry.match : null;
        const sourceSlug = sourceUUID ? sluggify(entry.value) : null;

        const item = actor.itemTypes.feat.find((feat) => {
            const featSlug = getItemSlug(feat);

            if (feat.sourceId !== selectionUUID && featSlug !== selectionSlug) {
                if (!sourceUUID) return false;
                if (feat.sourceId !== sourceUUID && featSlug !== sourceSlug) return false;
            }

            const level = getLevel(feat);
            return matchLevel ? level === actorLevel : level <= actorLevel;
        });

        return item ?? null;
    }

    updateEntryOverride(
        itemType: string | undefined,
        value: ItemUUID | null,
        index: number
    ): boolean {
        return itemType === "feat"
            ? R.isNumber(index)
                ? this.updateFeatOverride(index, value)
                : false
            : ImportDataModel.isCoreEntry(itemType)
            ? this.updateCoreOverride(itemType, value)
            : false;
    }

    updateCoreOverride(key: ImportDataCoreKey, value: ItemUUID | null): boolean {
        if (value === null || this[key].match === value) {
            this.updateSource({ [`${key}.-=override`]: null });
        } else {
            this.updateSource({ [`${key}.override`]: value });
        }
        return true;
    }

    updateFeatOverride(index: number, value: ItemUUID | null): boolean {
        const feats = this.feats.slice();
        const entry = feats.at(Number(index));
        if (!entry) return false;

        if (value === null || entry.match === value) {
            delete entry.override;
        } else {
            entry.override = value;
        }

        this.updateSource({ feats });
        return true;
    }
}

interface ImportDataModel extends ModelPropsFromSchema<ImportDataSchema> {}

function createBoostField(): ImportDataBoost {
    return new fields.ArrayField(
        new fields.StringField({
            nullable: false,
            blank: false,
            choices: ImportDataModel.attributeKeys,
        })
    );
}

function createEntryField(): EntryImportFieldSchema {
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

function getLevel(item: FeatPF2e): number;
function getLevel(item: ItemPF2e | null): number | undefined;
function getLevel(item: ItemPF2e | null) {
    if (!item) return;

    const { system } = item as { system: { level?: { taken?: number | null; value: number } } };
    return getLevel(item.grantedBy) ?? system.level?.taken ?? system.level?.value;
}

type ImportDataSource = WithPartial<
    SourceFromSchema<ImportDataSchema>,
    ImportDataCoreKey | "level"
>;

type ImportDataEntrySource = SourceFromSchema<EntryImportFieldSchema>;
type ImportDataFeatEntrySource = SourceFromSchema<FeatEntryImportFieldSchema>;

type ImportEntry = ModelPropsFromSchema<EntryImportFieldSchema>;
type ImportFeatEntry = ModelPropsFromSchema<FeatEntryImportFieldSchema>;

type EntryImportData = ModelPropFromDataField<EntryImportField>;

type EntryImportField = ImportSchemaField<EntryImportFieldSchema>;

type EntryImportFieldSchema = {
    match: fields.DocumentUUIDField<ItemUUID, false, true, true>;
    override: fields.DocumentUUIDField<ItemUUID, false, false, false>;
    value: fields.StringField;
};

type FeatEntryImportField = ImportSchemaField<FeatEntryImportFieldSchema>;

type FeatEntryImportFieldSchema = EntryImportFieldSchema & {
    category: fields.StringField<FeatOrFeatureCategory, FeatOrFeatureCategory, true, false, false>;
    level: fields.NumberField<number, number, true, false, false>;
    parent: fields.StringField<FeatEntryParent, FeatEntryParent, false, false, false>;
};

type FeatEntryParent = ImportDataCoreKey | `${number}`;

type ImportDataBoost = fields.ArrayField<fields.StringField<AttributeString, AttributeString>>;

type ImportDataAttributesSchema = {
    ancestry: fields.SchemaField<{
        boosts: ImportDataBoost;
        flaws: ImportDataBoost;
    }>;
    background: ImportDataBoost;
    class: ImportDataBoost;
    levels: KeyedRecordField<RecordFieldStringKey<AttributeLevel>, ImportDataBoost>;
    values: KeyedRecordField<
        RecordFieldStringKey<AttributeString>,
        fields.NumberField<number, number, true, false, false>
    >;
};

type ImportDataSchema = {
    ancestry: EntryImportField;
    attributes: SchemaField<ImportDataAttributesSchema, false, false, true>;
    background: EntryImportField;
    class: EntryImportField;
    feats: fields.ArrayField<FeatEntryImportField>;
    heritage: EntryImportField;
    level: fields.NumberField<number, number, true, false, false>;
    name: fields.StringField;
};

type AttributeLevel = (typeof ImportDataModel)["attributeLevels"][number];

type ImportDataCoreKey = (typeof ImportDataModel)["coreEntries"][number];
type ImportDataEntryKey = ImportDataCoreKey | "feat";

export { ImportDataModel };
export type {
    EntryImportData,
    FeatEntryParent,
    AttributeLevel,
    ImportDataCoreKey,
    ImportDataEntryKey,
    ImportDataEntrySource,
    ImportDataFeatEntrySource,
    ImportDataSource,
    ImportEntry,
    ImportFeatEntry,
};
