import {
    ActorPF2e,
    ActorTransferItemArgs,
    addListener,
    addListenerAll,
    CharacterPF2e,
    ChatMessagePF2e,
    CoinsPF2e,
    CompendiumBrowser,
    CompendiumBrowserEquipmentTab,
    confirmDialog,
    createEmitable,
    createHTMLElement,
    EquipmentFilters,
    FlagData,
    FlagDataArray,
    getPreferredName,
    htmlClosest,
    htmlQuery,
    htmlQueryIn,
    ItemTransferDialog,
    LootPF2e,
    LootSheetPF2e,
    NPCPF2e,
    PhysicalItemPF2e,
    R,
    registerWrapper,
    toggleSummary,
} from "module-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";
import {
    BrowserPullMenu,
    BuyDefaultFilterModel,
    DefaultFilterModel,
    FiltersMenu,
    ItemFilterModel,
    ServiceFilterModel,
    ServiceMenu,
    ServiceModel,
} from ".";
import { sharedActorTransferItemToActor } from "tools/_shared";

const FILTER_TYPES = {
    buy: {
        default: BuyDefaultFilterModel,
        filter: ItemFilterModel,
    },
    sell: {
        default: DefaultFilterModel,
        filter: ItemFilterModel,
    },
    service: {
        default: DefaultFilterModel,
        filter: ServiceFilterModel,
    },
};

class BetterMerchantTool extends ModuleTool<BetterMerchantSettings> {
    #useServiceEmitable = createEmitable(this.key, this.#useService.bind(this));
    #tradeItemEmitable = createEmitable(this.key, this.#tradeItem.bind(this));

    static INFINITY = "∞";

    get key(): "betterMerchant" {
        return "betterMerchant";
    }

    get settingsSchema(): ToolSettingsList<BetterMerchantSettings> {
        return [
            {
                key: "enabled",
                type: Boolean,
                default: false,
                scope: "world",
                requiresReload: true,
            },
        ];
    }

    get browser(): CompendiumBrowser {
        return game.pf2e.compendiumBrowser;
    }

    get browserTab(): CompendiumBrowserEquipmentTab {
        return this.browser.tabs.equipment;
    }

    init(isGM: boolean): void {
        if (!this.settings.enabled) return;

        this.#useServiceEmitable.activate();
    }

    ready(isGM: boolean): void {
        if (!this.settings.enabled) return;

        registerWrapper(
            "WRAPPER",
            "CONFIG.Actor.sheetClasses.loot['pf2e.LootSheetPF2e'].cls.prototype._renderInner",
            this.#lootSheetPF2eRenderInner,
            this
        );

        registerWrapper(
            "WRAPPER",
            "CONFIG.Actor.sheetClasses.loot['pf2e.LootSheetPF2e'].cls.prototype.activateListeners",
            this.#lootSheetPF2eActivateListeners,
            this
        );

        Hooks.on("renderItemTransferDialog", this.#onRenderItemTransferDialog.bind(this));

        sharedActorTransferItemToActor
            .register(this.#transferItemToActor, { context: this, priority: -100 })
            .activate();
    }

    getFilters<T extends FilterType>(
        actor: LootPF2e,
        type: T
    ): FlagDataArray<FilterTypes[T], LootPF2e> {
        return this.getDataFlagArray(
            actor,
            FILTER_TYPES[type].filter as any,
            "filters",
            type
        ) as FlagDataArray<FilterTypes[T], LootPF2e>;
    }

    getDefaultFilter(actor: LootPF2e, type: FilterType): FlagData<DefaultFilterModel> | undefined {
        return this.getDataFlag(actor, FILTER_TYPES[type].default, "default", type);
    }

    getAllFilters<T extends FilterType>(actor: LootPF2e, type: T): MerchantFilters<T> {
        return R.filter(
            [...this.getFilters(actor, type), this.getDefaultFilter(actor, type)],
            R.isTruthy
        ) as MerchantFilters<T>;
    }

    getServices(actor: LootPF2e): FlagDataArray<ServiceModel, LootPF2e> {
        return this.getDataFlagArray(actor, ServiceModel, "services");
    }

    async createService(actor: LootPF2e): Promise<ServiceModel> {
        const service = new ServiceModel();
        const services = this.getServices(actor);

        services.push(service);
        await services.setFlag();

        return service;
    }

    async deleteService(actor: LootPF2e, serviceId: string): Promise<boolean> {
        const services = this.getServices(actor);
        const deleted = !!services.findSplice((service) => service.id === serviceId);

        await services.setFlag();
        return deleted;
    }

    async openEquipmentTab(data: BrowserData, filters?: EquipmentFilters) {
        const browser = this.browser;

        if (browser.rendered) {
            await browser.close();
        }

        Hooks.once("renderCompendiumBrowser", (_, html: HTMLElement) =>
            this.#onBrowserRender(html, data)
        );

        browser.openTab("equipment", {
            filter: filters ?? (await this.browserTab.getFilterData()),
            hideNavigation: true,
        });
    }

    #onRenderItemTransferDialog(app: ItemTransferDialog, $html: JQuery) {
        const item = app.item;
        if (!isMerchant(item.actor)) return;

        const filter = this.getInMemory<ItemFilterModel>(item, "filter");
        if (!(filter instanceof foundry.abstract.DataModel)) return;

        const html = $html[0];
        const priceElement = htmlQuery(html, ".price");
        const quantityInput = htmlQuery<HTMLInputElement>(html, "input[name=quantity]");

        if (priceElement) {
            const getQuantity = () => {
                return Math.clamp(quantityInput?.valueAsNumber ?? 1, 1, item.quantity);
            };

            const updatePrice = () => {
                const quantity = getQuantity();
                const cost = game.pf2e.Coins.fromPrice(item.price, quantity).scale(filter.ratio);
                priceElement.innerText = `(${cost.toString()})`;
            };

            updatePrice();

            quantityInput?.addEventListener(
                "input",
                (event) => {
                    event.stopPropagation();
                    updatePrice();
                },
                true
            );

            quantityInput?.addEventListener(
                "blur",
                (event) => {
                    event.stopPropagation();
                    quantityInput.value = String(getQuantity());
                    updatePrice();
                },
                true
            );
        }
    }

    #transferItemToActor(source: ActorPF2e, ...args: ActorTransferItemArgs): boolean {
        const [target, item, quantity, containerId, newStack, isPurchase] = args;
        const realQty = Math.min(quantity, item.quantity);
        if (realQty <= 0) return false;

        const merchantBuying = isMerchant(target) && isCustomer(source);
        const merchantSelling = !merchantBuying && isMerchant(source) && isCustomer(target);
        if (!merchantSelling && !merchantBuying) return false;

        const [filter, merchant, customer] = merchantBuying
            ? [this.getAllFilters(target, "buy").find((x) => x.testFilter(item)), target, source]
            : [this.getInMemory<ItemFilterModel>(item, "filter"), source as LootPF2e, target];

        if (merchantSelling) {
            if (!filter) return false;

            if (isPurchase) {
                const price = game.pf2e.Coins.fromPrice(item.price, realQty).scale(filter.ratio);

                if (customer.inventory.coins.copperValue < price.copperValue) {
                    ui.notifications.warn(
                        game.i18n.format("PF2E.loot.InsufficientFundsMessage", {
                            buyer: customer.name,
                        })
                    );
                    return true;
                }
            }
        } else {
            if (!filter) {
                this.warning("item.refuse", { actor: merchant.name });
                return true;
            }

            console.log(filter);
        }

        this.#tradeItemEmitable.call({
            filterId: filter.id,
            free: !merchantBuying && !isPurchase,
            item,
            quantity: realQty,
            target,
        });

        return true;
    }

    async #tradeItem({ filterId, free, item, quantity, target }: TradeItemOptions) {
        const error = (reason: string) => {
            this.warning("item.error", { reason });
        };

        if (!item?.isOfType("physical") || !item.actor || !target) {
            return error("missing");
        }

        const itemActor = item.actor;
        const merchantSelling = isMerchant(itemActor);
        const [merchant, customer] = merchantSelling ? [itemActor, target] : [target, itemActor];

        const realQty = Math.min(quantity, item.quantity);

        if (realQty <= 0) {
            return error("quantity");
        }
    }

    async #lootSheetPF2eRenderInner(
        sheet: LootSheetPF2e<LootPF2e>,
        wrapped: libWrapper.RegisterCallback,
        data: LootSheetDataPF2e
    ): Promise<JQuery> {
        const $html = (await wrapped(data)) as JQuery;
        const actor = sheet.actor;
        if (!actor.isMerchant) return $html;

        const html = $html[0];
        const isGM = game.user.isGM;
        const inventoryList = htmlQuery(html, ".sheet-body .inventory-list");
        const services = isGM
            ? this.getServices(actor)
            : this.getServices(actor).filter((service) => service.canBePurchased);

        if (isGM || services.length) {
            const filters = this.getAllFilters(actor, "service");
            const content = await this.render("sheetServices", {
                services: await Promise.all(services.map((service) => service.toTemplate(filters))),
                infinity: BetterMerchantTool.INFINITY,
                isGM,
            });

            const servicesElement = createHTMLElement("div", { content });
            inventoryList?.prepend(...servicesElement.children);
        }

        const itemFilters = this.getAllFilters(actor, "sell");
        const infiniteAll = this.getFlag(actor, "infiniteAll");
        const items = inventoryList?.querySelectorAll<HTMLElement>(".items > [data-item-id]");

        for (const el of items ?? []) {
            const itemId = el.dataset.itemId as string;
            const item = actor.items.get<PhysicalItemPF2e<LootPF2e>>(itemId);
            if (!item) continue;

            const filter = itemFilters.find((filter) => filter.testFilter(item));
            const ratio = filter?.ratio ?? 1;

            if (ratio !== 1) {
                const priceElement = htmlQuery(el, ".price span");

                this.setInMemory(item, { filter });

                if (priceElement) {
                    priceElement.innerText = item.price.value.scale(ratio).toString();
                    priceElement.classList.add(ratio < 1 ? "cheap" : "expensive");
                }
            }

            if (infiniteAll) {
                const quantityElement = htmlQuery(el, ".quantity");

                if (quantityElement) {
                    quantityElement.innerHTML = BetterMerchantTool.INFINITY;
                }
            }
        }

        if (!isGM) return $html;

        const sheetElement = createHTMLElement("div", {
            classes: ["gm-settings"],
            content: await this.render("sheet", {
                infiniteAll,
            }),
        });

        htmlQuery(html, ".sheet-sidebar .image-container")?.after(sheetElement);

        if (infiniteAll) {
            const bulkElement = htmlQuery(html, ".total-bulk span");
            const wealthElement = htmlQuery(html, ".coinage .wealth .item-name:last-child span");

            if (bulkElement) {
                bulkElement.innerHTML = game.i18n.format("PF2E.Actor.Inventory.TotalBulk", {
                    bulk: BetterMerchantTool.INFINITY,
                });
            }

            if (wealthElement) {
                wealthElement.innerHTML = BetterMerchantTool.INFINITY;
            }
        }

        return $html;
    }

    #lootSheetPF2eActivateListeners(
        sheet: LootSheetPF2e<LootPF2e>,
        wrapped: libWrapper.RegisterCallback,
        $html: JQuery
    ) {
        wrapped($html);

        const actor = sheet.actor;
        if (!actor.isMerchant) return;

        const html = $html[0];

        addListenerAll(html, "[data-better-action]:not(.disabled)", (el, event) =>
            this.#onBetterAction(actor, el)
        );

        addListener(html, `input[name="infiniteAll"]`, "change", (el: HTMLInputElement) => {
            this.setFlag(actor, "infiniteAll", el.checked);
        });
    }

    async #onBetterAction(actor: LootPF2e, target: HTMLElement) {
        const action = target.dataset.betterAction as EventBetterAction;

        switch (action) {
            case "buy-service": {
                const buyer = getServiceBuyer();

                if (!buyer) {
                    return this.warning("service.noBuyer");
                }

                const serviceId = getServiceIdFromElement(target);
                const service = this.getServices(actor).find((x) => x.id === serviceId);

                if (!service?.hasStocks) {
                    return this.warning("service.noStock", { seller: actor.name });
                }

                const filters = this.getAllFilters(actor, "service");
                const filter = service.testFilters(filters);
                const price = service.getFilteredPrice(filter);

                if (buyer.inventory.coins.copperValue < price.copperValue) {
                    return this.warning("service.noFunds", {
                        buyer: buyer.name,
                        seller: actor.name,
                    });
                }

                return this.#useServiceEmitable.call({
                    buyer,
                    free: false,
                    seller: actor,
                    serviceId,
                });
            }

            case "create-service": {
                const service = await this.createService(actor);
                return new ServiceMenu(actor, service.id, this).render(true);
            }

            case "decrease-service": {
                return this.#updateServiceFromElement(actor, target, (service) => {
                    return { quantity: Math.max(service.quantity - 1, 0) };
                });
            }

            case "delete-service": {
                const confirm = await confirmDialog(this.localizeKey("serviceMenu.delete"));
                if (!confirm) return;

                const serviceId = getServiceIdFromElement(target);
                return this.deleteService(actor, serviceId);
            }

            case "edit-service": {
                const serviceId = getServiceIdFromElement(target);
                return new ServiceMenu(actor, serviceId, this).render(true);
            }

            case "export-services": {
                return;
            }

            case "from-browser": {
                const label = this.localize("browserPull.add");
                const callback = () => {
                    new BrowserPullMenu(this, actor).render(true);
                };
                return this.openEquipmentTab({ actor, label, callback });
            }

            case "give-service": {
                if (!game.user.isGM) return;

                const buyer = getServiceBuyer();

                if (!buyer) {
                    return this.warning("service.noBuyer");
                }

                return this.#useService({
                    buyer,
                    free: true,
                    seller: actor,
                    serviceId: getServiceIdFromElement(target),
                });
            }

            case "import-services": {
                return;
            }

            case "increase-service": {
                return this.#updateServiceFromElement(actor, target, (service) => {
                    return { quantity: service.quantity + 1 };
                });
            }

            case "service-to-chat": {
                const { service } = this.#getServiceDataFromElement(actor, target);
                return service && this.#serviceMessage(actor, service, actor, null);
            }

            case "setup-filters": {
                return new FiltersMenu(actor, this).render(true);
            }

            case "toggle-service-enabled": {
                return this.#updateServiceFromElement(actor, target, (service) => {
                    return { enabled: !service.enabled };
                });
            }

            case "toggle-service-summary": {
                const summary = htmlQueryIn(target, "[data-service-id]", ".item-summary");
                return summary && toggleSummary(summary);
            }
        }
    }

    #updateServiceFromElement(
        actor: LootPF2e,
        target: HTMLElement,
        updates: (service: ServiceModel) => Record<string, unknown>
    ) {
        const { service, services } = this.#getServiceDataFromElement(actor, target);
        if (!service) return;

        service.updateSource(updates(service));
        return services.setFlag();
    }

    async #useService({ buyer, free, seller, serviceId }: UseServiceOptions, userId?: string) {
        const services = this.getServices(seller);
        const service = services.find((x) => x.id === serviceId);

        const error = (reason: string) => {
            this.warning("service.error", { reason, service: serviceId });
        };

        if (!buyer || !seller || !service) {
            return error("missing");
        }

        const macroServiceData: ServiceMacroData["service"] = {
            seller: seller,
            usedPrice: null,
            serviceRatio: null,
            originalPrice: service.enrichedPrice,
            name: service.label,
            level: service.level,
            quantity: service.quantity,
            forceFree: free,
        };

        if (!free) {
            const quantity = service.quantity;

            if (quantity === 0) {
                return error("quantity");
            }

            const filters = this.getAllFilters(seller, "service");
            const filter = service.testFilters(filters);
            const price = service.getFilteredPrice(filter);

            if (!(await buyer.inventory.removeCoins(price))) {
                return error("funds");
            }

            if (quantity > 0) {
                service.updateSource({ quantity: quantity - 1 });
                await services.setFlag();
            }

            macroServiceData.usedPrice = price;
            macroServiceData.serviceRatio = filter?.ratio ?? 1;
            macroServiceData.quantity = service.quantity;
        }

        const macro = await service.getMacro();

        macro?.execute({
            actor: buyer,
            service: macroServiceData,
        } satisfies ServiceMacroData);

        this.#serviceMessage(buyer, service, seller, free ? "give" : "buy", userId);
    }

    async #serviceMessage(
        actor: ActorPF2e,
        service: ServiceModel,
        seller: LootPF2e,
        trade: "give" | "buy" | null,
        userId = game.userId
    ) {
        const token = actor.getActiveTokens(false, true).at(0);

        const tradeMsg =
            trade &&
            this.localize("service", trade, {
                buyer: getPreferredName(actor),
                seller: getPreferredName(seller),
            });

        const filters = this.getAllFilters(seller, "service");
        const ChatMessagePF2e = getDocumentClass("ChatMessage");
        const content = await this.render("serviceCard", {
            actor,
            tokenId: token?.id,
            service: await service.toTemplate(filters),
            tradeMsg,
        });

        const msgData: ChatMessageCreateData<ChatMessagePF2e> = {
            author: userId,
            style: CONST.CHAT_MESSAGE_STYLES.OTHER,
            content,
            speaker: ChatMessagePF2e.getSpeaker({
                actor: actor,
                token,
            }),
        };

        return ChatMessagePF2e.create(msgData);
    }

    async #onBrowserRender(html: HTMLElement, data: BrowserData) {
        const controls = htmlQuery(html, ".window-header [data-action='toggleControls']");

        const btn = createHTMLElement("button", {
            classes: ["better-merchant"],
            content: data.label,
        });

        btn.addEventListener("click", async (event) => {
            await this.browser.close();
            data.callback(event);
        });

        controls?.replaceWith(btn);
    }

    #getServiceDataFromElement(
        actor: LootPF2e,
        target: HTMLElement
    ): {
        services: FlagDataArray<ServiceModel, LootPF2e>;
        service: ServiceModel | undefined;
    } {
        const serviceId = getServiceIdFromElement(target);
        const services = this.getServices(actor);
        const service = services.find((service) => service.id === serviceId);

        return { services, service };
    }
}

function getServiceIdFromElement(target: HTMLElement): string {
    return htmlClosest(target, "[data-service-id]")?.dataset.serviceId ?? "";
}

function getServiceBuyer(): ActorPF2e | null {
    const isValidBuyer = (actor: Maybe<ActorPF2e>): actor is ActorPF2e => {
        return !!actor?.isOfType("npc", "character", "party") && actor.isOwner;
    };

    const selected = R.only(canvas.tokens.controlled)?.document.actor;

    if (isValidBuyer(selected)) {
        return selected;
    }

    const assigned = game.user.character;
    return isValidBuyer(assigned) ? assigned : null;
}

function isMerchant(actor: Maybe<ActorPF2e>): actor is LootPF2e {
    return !!actor?.isOfType("loot") && actor.isMerchant;
}

function isCustomer(actor: Maybe<ActorPF2e>): actor is CharacterPF2e | NPCPF2e {
    return !!actor?.isOfType("character", "npc", "vehicle", "party") && actor.isOwner;
}

type ServiceMacroData = {
    actor: ActorPF2e;
    service: {
        seller: LootPF2e;
        usedPrice: CoinsPF2e | null;
        serviceRatio: number | null;
        originalPrice: CoinsPF2e;
        name: string;
        level: number;
        quantity: number;
        forceFree: boolean;
    };
};

type TradeItemOptions = {
    filterId: string;
    free: boolean;
    item: PhysicalItemPF2e<ActorPF2e>;
    quantity: number;
    target: ActorPF2e;
};

type UseServiceOptions = {
    buyer: ActorPF2e;
    free: boolean;
    seller: LootPF2e;
    serviceId: string;
};

type EventSheetAction =
    | "create-service"
    | "export-services"
    | "from-browser"
    | "import-services"
    | "setup-filters";

type EventSheetServiceAction =
    | "buy-service"
    | "create-service"
    | "decrease-service"
    | "delete-service"
    | "edit-service"
    | "export-services"
    | "give-service"
    | "import-services"
    | "increase-service"
    | "service-to-chat"
    | "toggle-service-enabled"
    | "toggle-service-summary";

type EventBetterAction = EventSheetAction | EventSheetServiceAction;

type BrowserData = {
    actor: LootPF2e;
    label: string;
    callback: (event: MouseEvent) => void;
};

type BetterMerchantSettings = {
    enabled: boolean;
};

type LootSheetDataPF2e = Awaited<ReturnType<LootSheetPF2e<LootPF2e>["getData"]>>;

type FilterType = keyof typeof FILTER_TYPES;

type FilterTypes = {
    [k in FilterType]: InstanceType<(typeof FILTER_TYPES)[k]["filter"]>;
};

type MerchantFilters<T extends FilterType> = [...FilterTypes[T][], DefaultFilterModel];

export { BetterMerchantTool, FILTER_TYPES };
export type { FilterType, FilterTypes, MerchantFilters };
