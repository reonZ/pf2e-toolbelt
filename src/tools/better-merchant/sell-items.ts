import {
    ActorPF2e,
    ActorSheetPF2e,
    ApplicationClosingOptions,
    ApplicationConfiguration,
    ApplicationRenderOptions,
    CoinageSummary,
    CoinsPF2e,
    htmlClosest,
    LootPF2e,
    PhysicalItemType,
    R,
} from "module-helpers";
import { ModuleToolApplication } from "module-tool";
import { BetterMerchantTool, simulateDropItem } from ".";

class SellItemsMenu extends ModuleToolApplication<BetterMerchantTool> {
    #merchant: LootPF2e;
    #seller: ActorPF2e;

    static DEFAULT_OPTIONS: DeepPartial<ApplicationConfiguration> = {
        id: "pf2e-toolbelt-better-merchant-sellItems",
        position: {
            width: 600,
        },
    };

    constructor(
        tool: BetterMerchantTool,
        merchant: LootPF2e,
        seller: ActorPF2e,
        options?: DeepPartial<ApplicationConfiguration>
    ) {
        super(tool, options);

        this.#merchant = merchant;
        this.#seller = seller;

        seller.apps[this.id] = this;
    }

    get key(): string {
        return "sellItems";
    }

    get title(): string {
        return this.localize("title", this.seller);
    }

    get merchant(): LootPF2e {
        return this.#merchant;
    }

    get seller(): ActorPF2e {
        return this.#seller;
    }

    protected _onClose(options: ApplicationClosingOptions): void {
        delete this.seller.apps[this.id];
    }

    async _prepareContext(options: ApplicationRenderOptions): Promise<SellItemsContext> {
        const merchant = this.merchant;
        const seller = this.seller;
        const filters = this.tool.getAllFilters(merchant, "buy");

        const groups = R.pipe(
            seller.inventory.contents,
            R.map((item): SellingItem | undefined => {
                if (!item.isIdentified || item.quantity <= 0 || item.system.stackGroup === "coins")
                    return;

                const filter = filters.find((x) => x.testFilter(item));
                if (!filter) return;

                const ratio = filter.getRatio(item);
                const originalPrice = item.price.value;
                const price = ratio === 1 ? originalPrice : originalPrice.scale(ratio);
                const diffRatio = item.isOfType("treasure") ? 1 : 0.5;
                const diff = ratio < diffRatio ? "cheap" : ratio > diffRatio ? "expensive" : "";

                return {
                    diff,
                    id: item.id,
                    img: item.img,
                    name: item.name,
                    originalPrice,
                    price,
                    quantity: item.quantity,
                    type: item.type as PhysicalItemType,
                };
            }),
            R.filter(R.isTruthy),
            R.groupBy((item) => item.type),
            R.entries(),
            R.map(([type, items]) => {
                return {
                    items: R.sortBy(items, R.prop("name")),
                    label: game.i18n.localize(`TYPES.Item.${type}`),
                };
            }),
            R.sortBy(R.prop("label"))
        );

        const ActorSheet = seller.sheet.constructor as typeof ActorSheetPF2e<ActorPF2e>;

        return {
            inventory: {
                coins: ActorSheet["coinsToSheetData"](seller.inventory.coins),
            },
            groups,
        };
    }

    async _renderHTML(
        context: SellItemsContext,
        options: ApplicationRenderOptions
    ): Promise<string> {
        if (foundry.utils.isEmpty(context.groups)) {
            const hint = this.localize("empty", this.merchant);
            return `<div class="empty">${hint}</div>`;
        }

        return super._renderHTML(context, options);
    }

    protected _onClickAction(event: PointerEvent, target: HTMLElement) {
        const action = target.dataset.action as EventAction;

        const getItem = () => {
            const itemId = htmlClosest(target, "[data-item-id]")?.dataset.itemId;
            return this.seller.items.get(itemId ?? "");
        };

        if (action === "open-sheet") {
            getItem()?.sheet.render(true);
        } else if (action === "sell-item") {
            const item = getItem();

            if (item?.isOfType("physical") && item.quantity > 0) {
                simulateDropItem(item, this.merchant);
            }
        }
    }
}

type EventAction = "open-sheet" | "sell-item";

type SellingItem = {
    diff: "cheap" | "expensive" | "";
    id: string;
    img: ImageFilePath;
    name: string;
    originalPrice: CoinsPF2e;
    price: CoinsPF2e;
    quantity: number;
    type: PhysicalItemType;
};

type ItemsGroup = {
    items: SellingItem[];
    label: string;
};

type SellItemsContext = {
    inventory: {
        coins: CoinageSummary;
    };
    groups: ItemsGroup[];
};

export { SellItemsMenu };
