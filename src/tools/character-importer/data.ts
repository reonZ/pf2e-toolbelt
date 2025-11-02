import {
    CharacterPF2e,
    FeatOrFeatureCategory,
    FeatPF2e,
    getItemSlug,
    ItemPF2e,
    ModelPropFromDataField,
    OneToTen,
    R,
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

    isCoreEntry(value: unknown): value is ImportDataCoreKey {
        return R.isString(value) && R.isIncludedIn(value, this.coreEntries);
    }

    getSelection(entry: ImportEntry): CompendiumIndexData | null {
        const uuid = entry.override ?? entry.match;
        return uuid ? fromUuidSync<CompendiumIndexData>(uuid) : null;
    }

    getCurrentFeat(
        actor: CharacterPF2e,
        entry: ImportFeatEntry,
        matchLevel: boolean
    ): ItemPF2e | null {
        const selection = this.getSelection(entry);
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
            : R.isIncludedIn(itemType, this.coreEntries)
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

function getLevel(item: FeatPF2e): number;
function getLevel(item: ItemPF2e | null): number | undefined;
function getLevel(item: ItemPF2e | null) {
    if (!item) return;

    const { system } = item as { system: { level?: { taken?: number | null; value: number } } };
    return getLevel(item.grantedBy) ?? system.level?.taken ?? system.level?.value;
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
    override: fields.DocumentUUIDField<ItemUUID, false, false, false>;
    value: fields.StringField;
};

type FeatEntryImportField = ImportSchemaField<FeatEntryImportFieldSchema>;

type FeatEntryImportFieldSchema = EntryImportFieldSchema & {
    category: fields.StringField<FeatOrFeatureCategory, FeatOrFeatureCategory, true, false, false>;
    level: fields.NumberField<OneToTen, OneToTen, true, false, false>;
    parent: fields.StringField<FeatEntryParent, FeatEntryParent, false, false, false>;
};

type FeatEntryParent = ImportDataCoreKey | `${number}`;

type ImportDataSchema = {
    ancestry: EntryImportField;
    background: EntryImportField;
    class: EntryImportField;
    feats: fields.ArrayField<FeatEntryImportField>;
    heritage: EntryImportField;
    name: fields.StringField;
};

type ImportDataCoreKey = (typeof ImportDataModel)["coreEntries"][number];
type ImportDataEntryKey = ImportDataCoreKey | "feat";

export { ImportDataModel };
export type {
    EntryImportData,
    FeatEntryParent,
    ImportDataCoreKey,
    ImportDataEntryKey,
    ImportDataEntrySource,
    ImportDataFeatEntrySource,
    ImportDataSource,
    ImportEntry,
    ImportFeatEntry,
};
