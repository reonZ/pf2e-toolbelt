import {
    Coins,
    CoinsPF2e,
    enrichHTML,
    IdField,
    isScriptMacro,
    LevelField,
    MacroPF2e,
    R,
    TagsField,
} from "module-helpers";
import { MerchantFilters } from "..";
import fields = foundry.data.fields;

const COINS = ["pp", "gp", "sp", "cp", "credits", "upb"] as const;

const DEFAULT_SERVICE_ICON = "icons/commodities/currency/coins-plain-stack-gold.webp";

class ServiceModel extends foundry.abstract.DataModel<null, ServiceSchema> {
    static defineSchema(): ServiceSchema {
        return {
            description: new fields.StringField({
                required: false,
                blank: true,
                nullable: false,
                initial: "",
                trim: true,
            }),
            enabled: new fields.BooleanField({
                required: false,
                nullable: false,
                initial: true,
            }),
            id: new IdField(),
            img: new fields.FilePathField({
                categories: ["IMAGE"],
                required: false,
                blank: false,
                nullable: true,
                initial: DEFAULT_SERVICE_ICON,
            }),
            level: new LevelField(),
            macroUUID: new fields.DocumentUUIDField({
                required: false,
                nullable: true,
                type: "Macro",
            }),
            name: new fields.StringField({
                required: false,
                nullable: false,
                blank: true,
                initial: "",
                trim: true,
            }),
            price: new fields.SchemaField(
                R.fromKeys(COINS, (coin) => {
                    return new fields.NumberField({
                        required: false,
                        nullable: false,
                        initial: 0,
                        min: 0,
                    });
                }),
                {
                    required: false,
                    nullable: false,
                    initial: { pp: 0, gp: 0, cp: 0, sp: 0, credits: 0, upb: 0 },
                },
            ),
            quantity: new fields.NumberField({
                required: false,
                nullable: false,
                initial: -1,
                min: -1,
            }),
            tags: new TagsField(),
        };
    }

    get label(): string {
        return this.name || this.id;
    }

    get canBePurchased(): boolean {
        return this.enabled && this.quantity !== 0;
    }

    get enrichedPrice(): CoinsPF2e {
        return new game.pf2e.Coins(this.price);
    }

    get macroSync(): MacroPF2e | CompendiumIndexData | null {
        return this.macroUUID ? fromUuidSync<MacroPF2e>(this.macroUUID) : null;
    }

    get hasStocks(): boolean {
        return this.quantity !== 0;
    }

    async getMacro(): Promise<MacroPF2e | null> {
        const macro = this.macroUUID ? await fromUuid(this.macroUUID) : null;
        return isScriptMacro(macro) ? macro : null;
    }

    testFilters(filters: ServiceFilters): ServiceFilters[number] | undefined {
        return filters.find((filter) => filter.testFilter(this));
    }

    getEnrichedDescription(): Promise<string> {
        return enrichHTML(this.description);
    }

    toExport(): Omit<ServiceSource, "id" | "enabled"> {
        const data = this.toJSON() as WithPartial<ServiceSource, "id" | "enabled">;

        delete data.id;
        delete data.enabled;

        return data;
    }

    async toTemplate(filters: ServiceFilters): Promise<ServiceTemplate> {
        const filter = this.testFilters(filters);
        const ratio = filter?.ratio ?? 1;
        const enrichedPrice = filter?.calculatePrice(this)?.value ?? this.enrichedPrice;

        return {
            ...this,
            enrichedDescription: await this.getEnrichedDescription(),
            enrichedPrice,
            id: this.id,
            isFree: enrichedPrice.copperValue === 0,
            isInfinite: this.quantity < 0,
            label: this.label,
            notForSell: !filter,
            originalPrice: ratio === 1 ? undefined : this.enrichedPrice,
            priceUpdate: ratio > 1 ? "expensive" : ratio < 1 ? "cheap" : "",
        };
    }

    protected _initializeSource(
        data: object,
        options?: DataModelConstructionOptions<null> | undefined,
    ): this["_source"] {
        const source = super._initializeSource(data, options);

        source.tags = source.tags.map((x) => x.toLocaleLowerCase(game.i18n.lang));

        return source;
    }
}

interface ServiceModel extends ModelPropsFromSchema<ServiceSchema> {}

type ServiceTemplate = ServiceSource & {
    enrichedDescription: string;
    enrichedPrice: CoinsPF2e;
    isFree: boolean;
    isInfinite: boolean;
    label: string;
    notForSell: boolean;
    originalPrice: CoinsPF2e | undefined;
    priceUpdate: "expensive" | "cheap" | "";
};

type CoinsFieldSchema = Record<keyof Coins, fields.NumberField<number, number, false, false, true>>;

type ServiceSchema = {
    description: fields.StringField<string, string, false, false, true>;
    enabled: fields.BooleanField<boolean, boolean, false, false, true>;
    id: IdField;
    img: fields.FilePathField<ImageFilePath, ImageFilePath, false, true, true>;
    level: LevelField;
    macroUUID: fields.DocumentUUIDField<DocumentUUID, false, true, false>;
    name: fields.StringField<string, string, false, false, true>;
    price: fields.SchemaField<CoinsFieldSchema, Required<Coins>, Required<Coins>, false>;
    quantity: fields.NumberField<number, number, false, false, true>;
    tags: fields.ArrayField<fields.StringField>;
};

type ServiceSource = Omit<SourceFromSchema<ServiceSchema>, "price"> & {
    price: Coins;
};

type ServiceFilters = MerchantFilters<"service">;

export { DEFAULT_SERVICE_ICON, ServiceModel };
export type { ServiceSource };
