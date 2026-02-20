import {
    ActorPF2e,
    Coins,
    CurrencySummary,
    htmlClosest,
    ImageFilePath,
    LootPF2e,
    PhysicalItemType,
    R,
    simulateDropItem,
} from "foundry-helpers";
import { ModuleToolApplication } from "module-tool-application";
import { BetterMerchantTool } from "..";

class SellItemsMenu extends ModuleToolApplication<BetterMerchantTool> {
    #merchant: LootPF2e;
    #seller: ActorPF2e;

    static DEFAULT_OPTIONS: DeepPartial<fa.ApplicationConfiguration> = {
        id: "pf2e-toolbelt-better-merchant-sellItems",
        position: {
            width: 600,
        },
    };

    constructor(
        tool: BetterMerchantTool,
        merchant: LootPF2e,
        seller: ActorPF2e,
        options?: DeepPartial<fa.ApplicationConfiguration>,
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

    protected _onClose(_options: fa.ApplicationClosingOptions): void {
        delete this.seller.apps[this.id];
    }

    async _prepareContext(_options: fa.ApplicationRenderOptions): Promise<SellItemsContext> {
        const merchant = this.merchant;
        const seller = this.seller;
        const filters = this.tool.getAllFilters(merchant, "buy");
        const defaultFilter = this.tool.getDefaultFilter(merchant, "buy");
        const defaultRatio = defaultFilter?.enabled ? defaultFilter.ratio : 1;

        const groups = R.pipe(
            seller.inventory.contents,
            R.map((item): SellingItem | undefined => {
                if (!item.isIdentified || item.quantity <= 0 || item.system.stackGroup === "coins") return;

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
            R.sortBy(R.prop("label")),
        );

        const info = this.localize("info", {
            item: defaultRatio,
            treasure: Math.max(1, defaultRatio),
        });

        return {
            inventory: {
                currency: prepareCurrency(seller),
                info,
            },
            groups,
        };
    }

    async _renderHTML(context: SellItemsContext, options: fa.ApplicationRenderOptions): Promise<string> {
        if (foundry.utils.isEmpty(context.groups)) {
            const hint = this.localize("empty", this.merchant);
            return `<div class="empty">${hint}</div>`;
        }

        return super._renderHTML(context, options);
    }

    protected _onClickAction(_event: PointerEvent, target: HTMLElement) {
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
                simulateDropItem(item, this.merchant, true);
            }
        }
    }
}

const COIN_DENOMINATIONS = ["pp", "gp", "sp", "cp"] as const;

/**
 * truncated version of
 * https://github.com/foundryvtt/pf2e/blob/1465f7190b2b8454094c50fa6d06e9902e0a3c41/src/module/actor/sheet/base.ts#L313
 */
function prepareCurrency(actor: ActorPF2e): CurrencySummary["units"] {
    const SYSTEM_ID = game.system.id;

    const currency = actor.inventory.currency;
    const coins = new game.pf2e.Coins(R.pick(currency, COIN_DENOMINATIONS)); // just the pf2e values

    // Figure out what coins to show for what systems. If both, simplify pf2e values to gold
    const showPF2e = SYSTEM_ID === "pf2e" || COIN_DENOMINATIONS.some((d) => currency[d] > 0);
    const showSF2e = SYSTEM_ID === "sf2e" || currency.credits || currency.upb;
    const denominations =
        showPF2e && showSF2e
            ? (["gp", "credits", "upb"] as const)
            : showPF2e
              ? COIN_DENOMINATIONS
              : (["credits", "upb"] as const);
    if (showPF2e && showSF2e) {
        currency.gp = coins.goldValue;
        coins.sp = coins.pp = coins.cp = 0;
    }

    return denominations.reduce(
        (accumulated, d) => ({
            ...accumulated,
            [d]: { value: currency[d], label: CONFIG.PF2E.currencies[d] },
        }),
        {} as CurrencySummary["units"],
    );
}

type EventAction = "open-sheet" | "sell-item";

type SellingItem = {
    diff: "cheap" | "expensive" | "";
    id: string;
    img: ImageFilePath;
    name: string;
    originalPrice: Coins;
    price: Coins;
    quantity: number;
    type: PhysicalItemType;
};

type ItemsGroup = {
    items: SellingItem[];
    label: string;
};

type SellItemsContext = fa.ApplicationRenderContext & {
    inventory: {
        currency: CurrencySummary["units"];
        info: string;
    };
    groups: ItemsGroup[];
};

export { SellItemsMenu };
