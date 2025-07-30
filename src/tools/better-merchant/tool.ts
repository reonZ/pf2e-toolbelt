import {
    ActorPF2e,
    ActorSheetPF2e,
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
    createToggleableWrapper,
    createTradeMessage,
    EquipmentFilters,
    ErrorPF2e,
    FlagData,
    FlagDataArray,
    getPreferredName,
    giveItemToActor,
    htmlClosest,
    htmlQuery,
    htmlQueryIn,
    LootPF2e,
    LootSheetPF2e,
    MODULE,
    NPCPF2e,
    PhysicalItemPF2e,
    R,
    renderActorSheets,
    toggleHooksAndWrappers,
    toggleSummary,
    TradeMessageOptions,
    waitDialog,
} from "module-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";
import { sharedActorTransferItemToActor } from "tools/_shared";
import { ItemTransferDialog } from "trade-dialog";
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
    #useServiceEmitable = createEmitable(`${this.key}.service`, this.#useService.bind(this));
    #tradeItemEmitable = createEmitable(`${this.key}.item`, this.#tradeItem.bind(this));

    #wrappers = [
        createToggleableWrapper(
            "OVERRIDE",
            [
                "CONFIG.Actor.sheetClasses.character['pf2e.CharacterSheetPF2e'].cls.prototype.moveItemBetweenActors",
                "CONFIG.Actor.sheetClasses.loot['pf2e.LootSheetPF2e'].cls.prototype.moveItemBetweenActors",
                "CONFIG.Actor.sheetClasses.npc['pf2e.NPCSheetPF2e'].cls.prototype.moveItemBetweenActors",
                "CONFIG.Actor.sheetClasses.party['pf2e.PartySheetPF2e'].cls.prototype.moveItemBetweenActors",
                "CONFIG.Actor.sheetClasses.vehicle['pf2e.VehicleSheetPF2e'].cls.prototype.moveItemBetweenActors",
            ],
            this.#actorSheetPF2eMoveItemBetweenActors,
            { context: this }
        ),
        createToggleableWrapper(
            "WRAPPER",
            "CONFIG.Actor.sheetClasses.loot['pf2e.LootSheetPF2e'].cls.prototype._renderInner",
            this.#lootSheetPF2eRenderInner,
            { context: this }
        ),
        createToggleableWrapper(
            "WRAPPER",
            "CONFIG.Actor.sheetClasses.loot['pf2e.LootSheetPF2e'].cls.prototype.activateListeners",
            this.#lootSheetPF2eActivateListeners,
            { context: this }
        ),
        sharedActorTransferItemToActor.register(this.#transferItemToActor, {
            context: this,
            priority: -100,
        }),
    ];

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
                onChange: () => {
                    this._configurate();
                    renderActorSheets("LootSheetPF2e");
                },
            },
        ];
    }

    get browser(): CompendiumBrowser {
        return game.pf2e.compendiumBrowser;
    }

    get browserTab(): CompendiumBrowserEquipmentTab {
        return this.browser.tabs.equipment;
    }

    get api(): Record<string, any> {
        return {
            getAllFilters: this.getAllFilters,
        };
    }

    _configurate(): void {
        const enabled = this.settings.enabled;

        this.#useServiceEmitable.toggle(enabled);
        this.#tradeItemEmitable.toggle(enabled);
        toggleHooksAndWrappers(this.#wrappers, enabled);
    }

    ready(isGM: boolean): void {
        this._configurate();
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

    /**
     * slightly changed version of
     * https://github.com/foundryvtt/pf2e/blob/dfb9e2b53fc36a3525dec1706d24ec2bbafa6322/src/module/actor/sheet/base.ts#L1281
     */
    async #actorSheetPF2eMoveItemBetweenActors(
        sheet: ActorSheetPF2e<ActorPF2e>,
        event: DragEvent,
        item: PhysicalItemPF2e,
        targetActor: ActorPF2e
    ) {
        const sourceActor = item.actor;
        if (!sourceActor || !targetActor) {
            throw ErrorPF2e("Unexpected missing actor(s)");
        }

        const containerId = htmlClosest(
            event.target,
            "[data-is-container]"
        )?.dataset.containerId?.trim();
        const stackable = !!targetActor.inventory.findStackableItem(item._source);
        const isPurchase = sourceActor.isOfType("loot") && sourceActor.isMerchant;
        const infinite = isPurchase && this.getFlag(sourceActor, "infiniteAll");
        const filter = isPurchase ? this.getInMemory<ItemFilterModel>(item, "filter") : undefined;
        const isSelling = !isPurchase && isMerchant(targetActor) && isCustomer(sourceActor);

        // If more than one item can be moved, show a popup to ask how many to move
        const result = await new ItemTransferDialog(item, {
            infinite,
            isPurchase,
            lockStack: !stackable,
            prompt: isSelling ? this.localize("item.sell.prompt") : undefined,
            ratio: filter?.ratio,
            targetActor,
            title: isSelling ? this.localize("item.sell.title") : undefined,
        }).resolve();

        if (result !== null) {
            sourceActor.transferItemToActor(
                targetActor,
                item as PhysicalItemPF2e<ActorPF2e>,
                result.quantity,
                containerId,
                result.newStack,
                result.isPurchase
            );
        }
    }

    #transferItemToActor(source: ActorPF2e, ...args: ActorTransferItemArgs): boolean {
        const [target, item, quantity, containerId, newStack, isPurchase] = args;

        const error = (reason: string, data?: Record<string, string>): boolean => {
            if (data) {
                this.warning("item", reason, data);
            } else {
                this.warning("item", reason);
            }
            return true;
        };

        if (!item.isIdentified) {
            return error("unided");
        }

        const merchantSelling = isMerchant(source) && isCustomer(target);
        const merchantBuying = !merchantSelling && isMerchant(target) && isCustomer(source);
        if (!merchantSelling && !merchantBuying) return false;

        const [merchant, customer] = merchantSelling
            ? [source, target]
            : [target as LootPF2e, source];

        const infiniteAll = this.getFlag(merchant, "infiniteAll");
        const realQty = infiniteAll ? quantity : Math.min(quantity, item.quantity);

        if (realQty <= 0) {
            return error("noStock", { actor: source.name, item: item.name });
        }

        const filter = merchantSelling
            ? this.getInMemory<ItemFilterModel>(item, "filter")
            : this.getAllFilters(merchant, "buy").find((x) => x.testFilter(item));

        if (merchantSelling) {
            if (!filter) {
                return error("unwilling", { actor: merchant.name, item: item.name });
            }

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
                return error("refuse", { actor: merchant.name, item: item.name });
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

        return true;
    }

    async #tradeItem(
        { filterId, free, infinite, item, newStack, quantity, target }: TradeItemOptions,
        userId: string
    ) {
        const error = (reason: string) => {
            this.warning("item.error", { reason });
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
        const filter = this.getAllFilters(merchant, merchantSelling ? "sell" : "buy").find(
            (x) => x.id === filterId
        );

        if (!filter) {
            return error("filter");
        }

        const price = game.pf2e.Coins.fromPrice(item.price, realQty).scale(filter.ratio);

        if (merchantSelling && !free) {
            if (!(await buyer.inventory.removeCoins(price))) {
                return error("funds");
            }
        } else if (!merchantSelling) {
            await seller.inventory.addCoins(price);
        }

        const data: TradeMessageOptions = {
            message: "PF2E.loot.SellMessage",
            source: seller,
            subtitle: game.i18n.localize("PF2E.loot.SellSubtitle"),
            target,
            userId,
        } as TradeMessageOptions satisfies Omit<TradeMessageOptions, "item" | "quantity">;

        if (infinite) {
            const itemSource = item.toObject();

            const createItem = async () => {
                itemSource.system.quantity = realQty;
                itemSource.system.equipped.carryType = "worn";

                const [item] = await target.createEmbeddedDocuments("Item", [itemSource]);

                data.item = item as PhysicalItemPF2e<ActorPF2e>;
            };

            if (!newStack) {
                const existingItem = target.inventory.findStackableItem(itemSource);

                if (existingItem) {
                    await existingItem.update({
                        "system.quantity": existingItem.quantity + realQty,
                    });

                    data.item = existingItem;
                } else {
                    await createItem();
                }
            } else {
                await createItem();
            }

            data.quantity = realQty;
        } else {
            const added = await giveItemToActor(item, target, realQty, newStack);

            if (!added) {
                return error("added");
            }

            data.item = added.item;
            data.quantity = added.giveQuantity;
        }

        createTradeMessage(data);
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

            this.setInMemory(item, { filter });

            if (ratio !== 1) {
                const priceElement = htmlQuery(el, ".price span");

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

    async #importServices(actor: LootPF2e) {
        const result = await waitDialog<{ code: string }>({
            content: `<textarea name="code"></textarea>`,
            i18n: this.localizeKey("importServices"),
            title: this.localize("importServices.title", actor),
        });

        if (!result) return;

        try {
            const parsed = JSON.parse(result.code);
            const toAdd = R.pipe(
                Array.isArray(parsed) ? parsed : [parsed],
                R.map((data) => new ServiceModel(data))
            );

            if (!toAdd.length) return;

            const services = this.getServices(actor);

            services.push(...toAdd);
            services.setFlag();
        } catch (error) {
            MODULE.error(this.localize("importServices.error"), error);
        }
    }

    #buyService(actor: LootPF2e, serviceId: string) {
        const buyer = getServiceBuyer();

        if (!buyer) {
            return this.warning("service.noBuyer");
        }

        const service = this.getServices(actor).find((x) => x.id === serviceId);

        if (!service?.hasStocks) {
            return this.warning("service.noStock", { seller: actor.name });
        }

        const filters = this.getAllFilters(actor, "service");
        const filter = service.testFilters(filters);

        if (!filter) {
            return this.warning("service.unwilling", { seller: actor.name });
        }

        const price = service.getFilteredPrice(filter);

        if (buyer.inventory.coins.copperValue < price.copperValue) {
            return this.warning("service.noFunds", {
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

    async #onBetterAction(actor: LootPF2e, target: HTMLElement) {
        const action = target.dataset.betterAction as EventBetterAction;

        switch (action) {
            case "buy-service": {
                const serviceId = getServiceIdFromElement(target);
                return this.#buyService(actor, serviceId);
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
                const services = this.getServices(actor);
                const data = services.map((service) => service.toExport());

                game.clipboard.copyPlainText(JSON.stringify(data));
                return this.info("sheetServices.copied", actor);
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
                return this.#importServices(actor);
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

            if (!filter) {
                return error("filter");
            }

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

        btn.addEventListener(
            "click",
            async (event) => {
                await this.browser.close();
                data.callback(event);
            },
            { once: true }
        );

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
    containerId: string | undefined;
    filterId: string;
    free: boolean;
    infinite: boolean;
    item: PhysicalItemPF2e<ActorPF2e>;
    newStack: boolean | undefined;
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
