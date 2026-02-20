import {
    ActorPF2e,
    ActorSheetPF2e,
    addListener,
    addListenerAll,
    BrowserFilter,
    BrowserTabs,
    CharacterPF2e,
    Coins,
    CompendiumBrowser,
    confirmDialog,
    createEmitable,
    createHTMLElement,
    createToggleWrapper,
    getPreferredName,
    getSelectedActor,
    htmlClosest,
    htmlQuery,
    htmlQueryIn,
    isMerchant,
    isScriptMacro,
    ItemPF2e,
    LootPF2e,
    LootSheetPF2e,
    MODULE,
    NPCPF2e,
    PhysicalItemPF2e,
    R,
    renderActorSheets,
    simulateDropItem,
    SpellFilters,
    TabName,
    toggleHooksAndWrappers,
    toggleSummary,
    waitDialog,
} from "foundry-helpers";
import { LootSheetDataPF2e } from "foundry-helpers/src";
import { ModuleTool, ToolSettingsList } from "module-tool";
import { createTradeMessage, createTradeQuantityDialog, TradeMessageOptions, TradeQuantityDialogData } from "tools";
import {
    BrowserPullMenu,
    BuyDefaultFilter,
    DefaultFilterSource,
    FiltersMenu,
    ItemFilter,
    SellDefaultFilter,
    SellItemsMenu,
    ServiceData,
    ServiceDefaultFilter,
    ServiceFilter,
    ServiceMenu,
    ServiceSource,
    serviceToTemplate,
    zService,
} from ".";

const FILTER_TYPES = {
    buy: {
        default: BuyDefaultFilter,
        filter: ItemFilter,
    },
    sell: {
        default: SellDefaultFilter,
        filter: ItemFilter,
    },
    service: {
        default: ServiceDefaultFilter,
        filter: ServiceFilter,
    },
};

class BetterMerchantTool extends ModuleTool<BetterMerchantSettings> {
    #useServiceEmitable = createEmitable(this.path("service"), this.#useService.bind(this));
    #tradeItemEmitable = createEmitable(this.path("item"), this.#tradeItem.bind(this));

    #wrappers = [
        createToggleWrapper(
            "MIXED",
            [
                "CONFIG.Actor.sheetClasses.character['pf2e.CharacterSheetPF2e'].cls.prototype.moveItemBetweenActors",
                "CONFIG.Actor.sheetClasses.loot['pf2e.LootSheetPF2e'].cls.prototype.moveItemBetweenActors",
                "CONFIG.Actor.sheetClasses.npc['pf2e.NPCSheetPF2e'].cls.prototype.moveItemBetweenActors",
                "CONFIG.Actor.sheetClasses.party['pf2e.PartySheetPF2e'].cls.prototype.moveItemBetweenActors",
                "CONFIG.Actor.sheetClasses.vehicle['pf2e.VehicleSheetPF2e'].cls.prototype.moveItemBetweenActors",
            ],
            this.#actorSheetPF2eMoveItemBetweenActors,
            { context: this },
        ),
        createToggleWrapper(
            "WRAPPER",
            "CONFIG.Actor.sheetClasses.loot['pf2e.LootSheetPF2e'].cls.prototype._renderInner",
            this.#lootSheetPF2eRenderInner,
            { context: this },
        ),
        createToggleWrapper(
            "WRAPPER",
            "CONFIG.Actor.sheetClasses.loot['pf2e.LootSheetPF2e'].cls.prototype.activateListeners",
            this.#lootSheetPF2eActivateListeners,
            { context: this },
        ),
        createToggleWrapper(
            "MIXED",
            "CONFIG.Actor.documentClass.prototype.transferItemToActor",
            this.#actorTransferItemToActor,
            { context: this },
        ),
    ];

    static INFINITY = "∞";
    static NONE = "–";

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
                onChange: () => {
                    this._configurate();
                    renderActorSheets("LootSheetPF2e");
                },
            },
        ];
    }

    get api(): Record<string, any> {
        return {
            testItemsForMerchant: this.testItemsForMerchant.bind(this),
        };
    }

    get browser(): CompendiumBrowser {
        return game.pf2e.compendiumBrowser;
    }

    _configurate(): void {
        const enabled = this.settings.enabled;

        this.#useServiceEmitable.toggle(enabled);
        this.#tradeItemEmitable.toggle(enabled);
        toggleHooksAndWrappers(this.#wrappers, enabled);
    }

    ready(): void {
        this._configurate();
    }

    browserTab<T extends TabName>(tab: T): BrowserTabs[T] {
        return this.browser.tabs[tab];
    }

    getFilters<T extends FilterType>(actor: LootPF2e, type: T): FilterTypes[T][] {
        const sources = this.getFlag<DefaultFilterTypes[T][]>(actor, "filters", type) ?? [];
        if (!sources.length) return [];

        const ModelCls = FILTER_TYPES[type].filter;
        const schema = ModelCls.schema;

        return R.pipe(
            sources,
            R.map((source) => {
                const data = schema.safeDecode(source)?.data;
                return data ? (new ModelCls(data as any) as FilterTypes[T]) : undefined;
            }),
            R.filter(R.isTruthy),
        );
    }

    setFilters<T extends FilterType>(actor: LootPF2e, type: T, filters: FilterTypes[T][]): Promise<LootPF2e> {
        const encoder = FILTER_TYPES[type].filter.schema;
        const encoded = filters.map((filter) => encoder.encode(filter as any));
        return this.setFlag(actor, "filters", type, encoded);
    }

    getDefaultFilter<T extends FilterType>(actor: LootPF2e, type: T): DefaultFilterTypes[T] | undefined {
        const source = this.getFlag<DefaultFilterSource>(actor, "default", type);
        if (!source) return;

        const ModelCls = FILTER_TYPES[type].default;
        const data = ModelCls.schema.safeDecode(source)?.data;

        return data ? (new ModelCls(data as any) as DefaultFilterTypes[T]) : undefined;
    }

    getAllFilters<T extends FilterType>(actor: LootPF2e, type: T): MerchantFilters<T> {
        return [...this.getFilters(actor, type), this.getDefaultFilter(actor, type)] as MerchantFilters<T>;
    }

    getServices(actor: LootPF2e): ServiceData[] {
        return R.pipe(
            this.getFlag<ServiceSource[]>(actor, "services") ?? [],
            R.map((source) => zService.safeDecode(source)?.data),
            R.filter(R.isTruthy),
        );
    }

    setServives(actor: LootPF2e, services: ServiceData[]): Promise<LootPF2e> {
        const encoded = services.map((service) => zService.encode(service));
        return this.setFlag<LootPF2e, ServiceSource[]>(actor, "services", encoded);
    }

    async createService(actor: LootPF2e): Promise<ServiceData> {
        const service = zService.parse({});
        const services = this.getServices(actor);

        services.push(service);
        await this.setServives(actor, services);

        return service;
    }

    async deleteService(actor: LootPF2e, serviceId: string): Promise<boolean> {
        const services = this.getServices(actor);
        const deleted = !!services.findSplice((service) => service.id === serviceId);

        await this.setServives(actor, services);
        return deleted;
    }

    async pullItemsFromBrowser(actor: LootPF2e, tab: "equipment" | "spell") {
        const label = this.localize("browserPull.add");
        const callback = async () => {
            new BrowserPullMenu(this, actor, tab).render(true);
        };

        const filters =
            tab === "spell"
                ? foundry.utils.mergeObject<SpellFilters, DeepPartial<SpellFilters>>(
                      await this.browserTab("spell").getFilterData(),
                      {
                          checkboxes: {
                              category: {
                                  selected: ["spell"],
                                  options: { spell: { selected: true } },
                              },
                          },
                      },
                  )
                : undefined;

        return this.openBrowserTab(tab, { actor, label, callback }, filters);
    }

    async openBrowserTab(tab: TabName, data: BrowserData, filters?: BrowserFilter) {
        const browser = this.browser;

        if (browser.rendered) {
            await browser.close();
        }

        Hooks.once("renderCompendiumBrowser", (_tab: TabName, html: HTMLElement) => {
            this.#onBrowserRender(html, data);
        });

        browser.openTab(tab, {
            filter: filters ?? (await this.browserTab(tab).getFilterData()),
            hideNavigation: true,
        });
    }

    testItemsForMerchant(merchant: ActorPF2e, items: ItemPF2e[]): TestItemData[] {
        if (!(merchant instanceof Actor) || !isMerchant(merchant) || !items?.[Symbol.iterator]) return [];

        const filters = this.getAllFilters(merchant, "buy");

        return R.pipe(
            items,
            R.filter((item): item is PhysicalItemPF2e<CharacterPF2e | NPCPF2e> => {
                return (
                    item instanceof Item &&
                    item.isOfType("physical") &&
                    item.isIdentified &&
                    isOwnedCustomer(item.actor)
                );
            }),
            R.map((item): TestItemData | undefined => {
                const filter = filters.find((x) => x.testFilter(item));
                if (!filter) return;

                const buyPrice = filter.calculatePrice(item).value;
                return { buyPrice, item };
            }),
            R.filter(R.isTruthy),
        );
    }

    async #actorSheetPF2eMoveItemBetweenActors(
        _sheet: ActorSheetPF2e<ActorPF2e>,
        wrapped: libWrapper.RegisterCallback,
        event: DragEvent,
        item: PhysicalItemPF2e,
        targetActor: ActorPF2e,
    ) {
        const sourceActor = item.actor;
        if (!sourceActor || !targetActor) {
            return wrapped(event, item, targetActor);
        }

        const isPurchase = isMerchant(sourceActor) && isOwnedCustomer(targetActor);
        const isSelling = !isPurchase && isMerchant(targetActor) && isOwnedCustomer(sourceActor);

        if (!isPurchase && !isSelling) {
            return wrapped(event, item, targetActor);
        }

        const result = await this.#initiateTrade(sourceActor, targetActor, item, isPurchase);

        if (result !== null) {
            const containerId = htmlClosest(event.target, "[data-is-container]")?.dataset.containerId?.trim();

            sourceActor.transferItemToActor(
                targetActor,
                item as PhysicalItemPF2e<ActorPF2e>,
                result.quantity,
                containerId,
                result.newStack,
                isPurchase,
            );
        }
    }

    async #initiateTrade(
        sourceActor: ActorPF2e,
        targetActor: ActorPF2e,
        item: PhysicalItemPF2e,
        isPurchase: boolean,
    ): Promise<TradeQuantityDialogData | null> {
        const stackable = !!targetActor.inventory.findStackableItem(item);
        const infinite = isPurchase && this.getFlag(sourceActor, "infiniteAll");

        if (!infinite && item.quantity <= 1) {
            return {
                quantity: item.quantity,
                newStack: true,
            };
        }

        const title = isPurchase
            ? game.i18n.format("PF2E.ItemTransferDialog.Title.purchase", { item: item.name })
            : this.localize("item.sell.title", { item: item.name });

        const prompt = isPurchase
            ? game.i18n.format("PF2E.ItemTransferDialog.Prompt.purchase", {
                  actor: targetActor.name,
              })
            : this.localize("item.sell.prompt", { actor: sourceActor.name });

        const label = isPurchase
            ? game.i18n.localize("PF2E.ItemTransferDialog.Button.purchase")
            : this.localize("item.sell.button");

        return createTradeQuantityDialog({
            button: {
                action: isPurchase ? "buy" : "sell",
                icon: "fa-solid fa-coins",
                label,
            },
            item,
            lockStack: !stackable,
            maxQuantity: infinite ? 9999 : item.quantity,
            prompt,
            quantity: infinite ? Math.min(item.quantity, item.system.price.per) : item.quantity,
            targetActor,
            title,
        });
    }

    async #actorTransferItemToActor(
        source: ActorPF2e,
        wrapped: libWrapper.RegisterCallback,
        ...args: ActorTransferItemArgs
    ): Promise<PhysicalItemPF2e<ActorPF2e> | null> {
        const [target, item, quantity, containerId, newStack, isPurchase] = args;

        const merchantSelling = isMerchant(source) && isOwnedCustomer(target);
        const merchantBuying = !merchantSelling && isMerchant(target) && isOwnedCustomer(source);
        if (!merchantSelling && !merchantBuying) return wrapped(...args);

        const error = (reason: string, data?: Record<string, string>) => {
            if (data) {
                this.localize.warning("item", reason, data);
            } else {
                this.localize.warning("item", reason);
            }
            return null;
        };

        if (!item.isIdentified) {
            return error("unided");
        }

        const [merchant, customer] = merchantSelling ? [source, target] : [target as LootPF2e, source];
        const infiniteAll = this.getFlag(merchant, "infiniteAll");
        const realQty = infiniteAll ? quantity : Math.min(quantity, item.quantity);

        if (realQty <= 0) {
            return error("noStock", { actor: source.name, item: item.name });
        }

        const filter = merchantSelling
            ? this.getInMemory<ItemFilter>(item, "filter")
            : this.getAllFilters(merchant, "buy").find((x) => x.testFilter(item));

        if (!filter) {
            return error(merchantSelling ? "unwilling" : "refuse", { actor: merchant.name, item: item.name });
        }

        if (merchantSelling && isPurchase) {
            const price = filter.calculatePrice(item, realQty).value;

            if (customer.inventory.coins.copperValue < price.copperValue) {
                ui.notifications.warn(game.i18n.format("PF2E.loot.InsufficientFundsMessage", { buyer: customer.name }));
                return null;
            }
        }

        this.#tradeItemEmitable.call({
            containerId,
            filterId: filter.id,
            free: !merchantBuying && !isPurchase,
            infinite: merchantSelling && !!infiniteAll,
            item,
            newStack,
            quantity: realQty,
            target,
        });

        return null;
    }

    async #tradeItem({ filterId, free, infinite, item, newStack, quantity, target }: TradeItemOptions, userId: string) {
        const error = (reason: string) => {
            this.localize.warning("item.error", { reason });
        };

        if (!item?.isOfType("physical") || !item.actor || !target) {
            return error("missing");
        }

        const seller = item.actor;
        const buyer = target;
        const realQty = infinite ? quantity : Math.min(quantity, item.quantity);

        if (realQty <= 0) {
            return error("quantity");
        }

        const merchantSelling = isMerchant(seller);
        const merchant = merchantSelling ? seller : (buyer as LootPF2e);
        const filter = this.getAllFilters(merchant, merchantSelling ? "sell" : "buy").find((x) => x.id === filterId);

        if (!filter) {
            return error("filter");
        }

        const isContainer = item.isOfType("backpack");
        const price = filter.calculatePrice(item, realQty).value;

        if (merchantSelling && !free) {
            if (!(await buyer.inventory.removeCurrency(price))) {
                return error("funds");
            }
        } else if (!merchantSelling) {
            await seller.inventory.addCurrency(price);
        }

        const data: TradeMessageOptions = {
            message: "PF2E.loot.SellMessage",
            source: seller,
            subtitle: game.i18n.localize("PF2E.loot.SellSubtitle"),
            target,
            userId,
        } as TradeMessageOptions satisfies Omit<TradeMessageOptions, "item" | "quantity">;

        if (!infinite) {
            const remainingQty = item.quantity - realQty;

            if (remainingQty < 1) {
                await item.delete();
            } else {
                await item.update({ "system.quantity": remainingQty });
            }
        }

        const existingItem = !newStack && !isContainer && target.inventory.findStackableItem(item);

        if (existingItem) {
            await existingItem.update({ "system.quantity": existingItem.quantity + realQty });

            data.quantity = realQty;
            data.item = existingItem;
        } else {
            const itemSource = item.toObject();

            itemSource.system.quantity = realQty;
            itemSource.system.equipped.carryType = "worn";

            const [newItem] = (await target.createEmbeddedDocuments("Item", [itemSource])) as PhysicalItemPF2e[];

            if (!newItem) {
                return error("added");
            }

            data.item = newItem;
            data.quantity = newItem.quantity;
        }

        createTradeMessage(data);
    }

    async #lootSheetPF2eRenderInner(
        sheet: LootSheetPF2e<LootPF2e>,
        wrapped: libWrapper.RegisterCallback,
        data: LootSheetDataPF2e,
    ): Promise<JQuery> {
        const $html = (await wrapped(data)) as JQuery;
        const actor = sheet.actor;
        if (!actor.isMerchant) return $html;

        const html = $html[0];
        const isGM = game.user.isGM;
        const inventoryList = htmlQuery(html, ".sheet-body .inventory-list");
        const services = isGM
            ? this.getServices(actor)
            : this.getServices(actor).filter((service) => service.enabled && service.quantity > 0);

        html.classList.add("better-merchant");
        inventoryList?.classList.toggle("is-player", !isGM);

        if (isGM || services.length) {
            const filters = this.getAllFilters(actor, "service");
            const content = await this.render("sheetServices", {
                infinity: {
                    label: BetterMerchantTool.INFINITY,
                    tooltip: this.localize("sheet.infiniteAll.label"),
                },
                isGM,
                none: {
                    label: BetterMerchantTool.NONE,
                    tooltip: this.localize("sheet.none"),
                },
                services: await Promise.all(services.map((service) => serviceToTemplate(service, filters))),
            });

            const servicesElement = createHTMLElement("div", { content });
            inventoryList?.prepend(...servicesElement.children);
        }

        const itemFilters = this.getAllFilters(actor, "sell");
        const infiniteAll = this.getFlag(actor, "infiniteAll");
        const items = inventoryList?.querySelectorAll<HTMLElement>(".items > [data-item-id]");
        const infiniteAllLabel = this.localize("sheet.infiniteAll.label");
        const notForSellLabel = this.localize("sheet.none");

        for (const el of items ?? []) {
            const itemId = el.dataset.itemId as string;
            const item = actor.items.get<PhysicalItemPF2e<LootPF2e>>(itemId);
            if (!item) continue;

            const filter = itemFilters.find((filter) => filter.testFilter(item));
            const ratio = filter?.getRatio(item) ?? 1;

            this.setInMemory(item, { filter });

            if (ratio !== 1) {
                const priceElement = htmlQuery(el, ".price span");

                if (priceElement) {
                    priceElement.dataset.tooltip = priceElement.innerText;
                    priceElement.innerText = item.price.value.scale(ratio).toString();
                    priceElement.classList.add(ratio < 1 ? "cheap" : "expensive");
                }
            }

            const quantityElement = htmlQuery(el, ".quantity");
            if (quantityElement) {
                if (!filter) {
                    quantityElement.dataset.tooltip = notForSellLabel;
                    quantityElement.innerHTML = BetterMerchantTool.NONE;
                } else if (infiniteAll) {
                    quantityElement.dataset.tooltip = infiniteAllLabel;
                    quantityElement.innerHTML = BetterMerchantTool.INFINITY;
                }
            }

            if (item.quantity <= 0) continue;

            let controls = htmlQuery(el, ".item-controls");

            if (!controls) {
                controls = createHTMLElement("div", { classes: ["item-controls"] });
                htmlQuery(el, ".data")?.appendChild(controls);
            }

            if (!filter && !isGM) continue;

            const buyBtn = createHTMLElement("a", {
                content: `<i class="fa-fw fa-solid fa-coins"></i>`,
                dataset: {
                    betterAction: "buy-item",
                    tooltip: "PF2E.loot.BuySubtitle",
                },
            });

            controls?.prepend(buyBtn);
        }

        const sheetElement = createHTMLElement("div", {
            classes: ["gm-settings"],
            content: await this.render("sheet", {
                infiniteAll,
                isGM,
            }),
        });

        htmlQuery(html, ".sheet-sidebar .image-container")?.after(sheetElement);

        if (!isGM) return $html;

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
        $html: JQuery,
    ) {
        wrapped($html);

        const merchant = sheet.actor;
        if (!merchant.isMerchant) return;

        const html = $html[0];

        addListenerAll(html, "[data-better-action]:not(.disabled)", (el) => this.#onBetterAction(merchant, el));

        addListener(html, `input[name="infiniteAll"]`, "change", (el: HTMLInputElement) => {
            this.setFlag(merchant, "infiniteAll", el.checked);
        });

        const sellBtn = htmlQuery(html, `[data-better-action="sell-items"]`);
        // we remove the disabled attribute added by foundry because players can't technically edit the sheet
        sellBtn?.removeAttribute("disabled");

        sellBtn?.addEventListener("click", () => {
            const seller = getSelectedActor(isCustomer);

            if (!seller) {
                return this.localize.warning("sheet.sellItems.noSelection");
            }

            new SellItemsMenu(this, merchant, seller).render(true);
        });
    }

    async #importServices(actor: LootPF2e) {
        const result = await waitDialog<{ code: string }>({
            content: `<textarea name="code"></textarea>`,
            i18n: this.path("importServices"),
            title: this.localize("importServices.title", actor),
        });

        if (!result) return;

        try {
            const parsed = JSON.parse(result.code);
            const toAdd = R.pipe(
                Array.isArray(parsed) ? parsed : [parsed],
                R.map((source) => zService.safeDecode(source)?.data),
                R.filter(R.isTruthy),
            );

            if (!toAdd.length) return;

            const services = this.getServices(actor);

            services.push(...toAdd);
            await this.setServives(actor, services);
        } catch (error: any) {
            MODULE.error(this.localize("importServices.error"), error);
        }
    }

    #buyService(actor: LootPF2e, serviceId: string) {
        const buyer = getSelectedActor(isServiceCustomer);

        if (!buyer) {
            return this.localize.warning("service.noBuyer");
        }

        const service = this.getServices(actor).find((x) => x.id === serviceId);

        if (!service || service.quantity < 1) {
            return this.localize.warning("service.noStock", { seller: actor.name });
        }

        const filters = this.getAllFilters(actor, "service");
        const filter = filters.find((filter) => filter.testFilter(service));

        if (!filter) {
            return this.localize.warning("service.unwilling", { seller: actor.name });
        }

        const price = filter.calculatePrice(service).value;

        if (buyer.inventory.coins.copperValue < price.copperValue) {
            return this.localize.warning("service.noFunds", {
                buyer: buyer.name,
                seller: actor.name,
            });
        }

        this.#useServiceEmitable.call({
            buyer,
            free: false,
            seller: actor,
            serviceId,
        });
    }

    async #buyItem(actor: LootPF2e, item: PhysicalItemPF2e<LootPF2e>) {
        const target = getSelectedActor();

        if (!target?.isOfType("character", "npc", "party", "vehicle")) {
            return this.localize.warning("item.buy.noTarget");
        }

        if (item.quantity === 1 && !this.getFlag(actor, "infiniteAll")) {
            const result = await confirmDialog(this.path("item.buy.confirm"), {
                data: { buyer: target.name, item: item.name },
            });
            if (!result) return;
        }

        simulateDropItem(item, target, true);
    }

    async #onBetterAction(actor: LootPF2e, target: HTMLElement) {
        const action = target.dataset.betterAction as EventBetterAction;

        switch (action) {
            case "buy-item": {
                const itemId = htmlClosest(target, "[data-item-id]")?.dataset.itemId ?? "";
                const item = actor.items.get<PhysicalItemPF2e<LootPF2e>>(itemId);

                return item && this.#buyItem(actor, item);
            }

            case "buy-service": {
                const serviceId = getServiceIdFromElement(target);
                return this.#buyService(actor, serviceId);
            }

            case "create-scrolls": {
                return this.pullItemsFromBrowser(actor, "spell");
            }

            case "create-service": {
                const service = await this.createService(actor);
                return new ServiceMenu(actor, service.id, this).render(true);
            }

            case "decrease-service": {
                return this.#updateServiceFromElement(actor, target, (service) => {
                    service.quantity = Math.max(service.quantity - 1, 0);
                });
            }

            case "delete-service": {
                const confirm = await confirmDialog(this.path("serviceMenu.delete"));
                if (!confirm) return;

                const serviceId = getServiceIdFromElement(target);
                return this.deleteService(actor, serviceId);
            }

            case "edit-service": {
                const serviceId = getServiceIdFromElement(target);
                return new ServiceMenu(actor, serviceId, this).render(true);
            }

            case "export-services": {
                const services = this.getServices(actor);
                const data = services.map((service) => zService.encode(service));

                game.clipboard.copyPlainText(JSON.stringify(data));
                return this.localize.info("sheetServices.copied", actor);
            }

            case "from-browser": {
                return this.pullItemsFromBrowser(actor, "equipment");
            }

            case "give-service": {
                if (!game.user.isGM) return;

                const buyer = getSelectedActor(isServiceCustomer);

                if (!buyer) {
                    return this.localize.warning("service.noBuyer");
                }

                return this.#useService({
                    buyer,
                    free: true,
                    seller: actor,
                    serviceId: getServiceIdFromElement(target),
                });
            }

            case "import-services": {
                return this.#importServices(actor);
            }

            case "increase-service": {
                return this.#updateServiceFromElement(actor, target, (service) => {
                    service.quantity = service.quantity + 1;
                });
            }

            case "service-to-chat": {
                const { service } = this.#getServiceDataFromElement(actor, target);
                return service && this.#serviceMessage(actor, service, actor, null);
            }

            case "setup-filters": {
                return new FiltersMenu(this, actor).render(true);
            }

            case "toggle-service-enabled": {
                return this.#updateServiceFromElement(actor, target, (service) => {
                    service.enabled = !service.enabled;
                });
            }

            case "toggle-service-summary": {
                const summary = htmlQueryIn(target, "[data-service-id]", ".item-summary");
                return summary && toggleSummary(summary);
            }
        }
    }

    #updateServiceFromElement(actor: LootPF2e, target: HTMLElement, updateService: (service: ServiceData) => void) {
        const { service, services } = this.#getServiceDataFromElement(actor, target);
        if (!service) return;

        updateService(service);
        return this.setServives(actor, services);
    }

    async #useService({ buyer, free, seller, serviceId }: UseServiceOptions, userId?: string) {
        const services = this.getServices(seller);
        const service = services.find((x) => x.id === serviceId);

        const error = (reason: string) => {
            this.localize.warning("service.error", { reason, service: serviceId });
        };

        if (!buyer || !seller || !service) {
            return error("missing");
        }

        const macroServiceData: ServiceMacroData["service"] = {
            seller: seller,
            usedPrice: null,
            serviceRatio: null,
            originalPrice: service.price,
            name: service.name || service.id,
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
            const filter = filters.find((filter) => filter.testFilter(service));

            if (!filter) {
                return error("filter");
            }

            const calculatedPrice = filter.calculatePrice(service);

            if (!(await buyer.inventory.removeCoins(calculatedPrice.value))) {
                return error("funds");
            }

            if (quantity > 0) {
                service.quantity = quantity - 1;
                await this.setServives(seller, services);
            }

            macroServiceData.usedPrice = calculatedPrice.value;
            macroServiceData.serviceRatio = calculatedPrice.ratio;
            macroServiceData.quantity = service.quantity;
        }

        const macro = service.macroUUID ? await fromUuid(service.macroUUID) : null;
        if (isScriptMacro(macro)) {
            macro.execute({ actor: buyer, service: macroServiceData } satisfies ServiceMacroData);
        }

        this.#serviceMessage(buyer, service, seller, free ? "give" : "buy", userId);
    }

    async #serviceMessage(
        actor: ActorPF2e,
        service: ServiceData,
        seller: LootPF2e,
        trade: "give" | "buy" | null,
        userId = game.userId,
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
            service: await serviceToTemplate(service, filters),
            tradeMsg,
        });

        return ChatMessagePF2e.create({
            author: userId,
            style: CONST.CHAT_MESSAGE_STYLES.OTHER,
            content,
            speaker: ChatMessagePF2e.getSpeaker({
                actor: actor,
                token,
            }),
        });
    }

    async #onBrowserRender(html: HTMLElement, data: BrowserData) {
        const controls = htmlQuery(html, ".window-header [data-action='toggleControls']");

        const btn = createHTMLElement("button", {
            classes: ["better-merchant"],
            content: data.label,
        });

        btn.addEventListener(
            "click",
            async (event) => {
                data.callback(event);
                this.browser.close();
            },
            { once: true },
        );

        requestAnimationFrame(() => {
            const invalids = html.querySelectorAll<HTMLInputElement>(
                `input[name="cantrip"], input[name="focus"], input[name="ritual"]`,
            );

            for (const el of invalids) {
                el.disabled = true;
            }
        });

        controls?.replaceWith(btn);
    }

    #getServiceDataFromElement(
        actor: LootPF2e,
        target: HTMLElement,
    ): {
        services: ServiceData[];
        service: ServiceData | undefined;
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

function isCustomer(actor: Maybe<ActorPF2e>): actor is ActorPF2e {
    return !!actor?.isOfType("character", "npc", "vehicle", "party");
}

function isOwnedCustomer(actor: Maybe<ActorPF2e>): actor is ActorPF2e {
    return isCustomer(actor) && actor.isOwner;
}

function isServiceCustomer(actor: Maybe<ActorPF2e>) {
    return !!actor?.isOfType("npc", "character", "party");
}

const betterMerchantTool = new BetterMerchantTool();

type EventItemAction = "buy-item";

type EventSheetAction =
    | "create-scrolls"
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

type EventBetterAction = EventItemAction | EventSheetAction | EventSheetServiceAction;

type TradeItemOptions = {
    containerId: string | undefined;
    filterId: string;
    free: boolean;
    infinite: boolean;
    item: PhysicalItemPF2e<ActorPF2e>;
    newStack: boolean | undefined;
    quantity: number;
    target: ActorPF2e;
};

type BrowserData = {
    actor: LootPF2e;
    label: string;
    callback: (event: MouseEvent) => Promise<void>;
};

type BetterMerchantSettings = {
    enabled: boolean;
};

type ActorTransferItemArgs = [
    targetActor: ActorPF2e,
    item: PhysicalItemPF2e<ActorPF2e>,
    quantity: number,
    containerId?: string,
    newStack?: boolean,
    isPurchase?: boolean | null,
];

type ServiceMacroData = {
    actor: ActorPF2e;
    service: {
        seller: LootPF2e;
        usedPrice: Coins | null;
        serviceRatio: number | null;
        originalPrice: Coins;
        name: string;
        level: number;
        quantity: number;
        forceFree: boolean;
    };
};

type UseServiceOptions = {
    buyer: ActorPF2e;
    free: boolean;
    seller: LootPF2e;
    serviceId: string;
};

type FilterType = keyof typeof FILTER_TYPES;

type DefaultFilterTypes = {
    [k in FilterType]: InstanceType<(typeof FILTER_TYPES)[k]["default"]>;
};

type FilterTypes = {
    [k in FilterType]: InstanceType<(typeof FILTER_TYPES)[k]["filter"]>;
};

type MerchantFilters<T extends FilterType> = [...FilterTypes[T][], DefaultFilterTypes[T]];

type TestItemData = toolbelt.betterMerchant.TestItemData;

export { betterMerchantTool, FILTER_TYPES };
export type { BetterMerchantTool, FilterType, FilterTypes, MerchantFilters, DefaultFilterTypes };
