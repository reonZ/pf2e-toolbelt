import {
    ActorPF2e,
    ApplicationClosingOptions,
    ApplicationConfiguration,
    ApplicationRenderContext,
    ApplicationRenderOptions,
    ChatMessagePF2e,
    Coins,
    CoinsPF2e,
    CompendiumBrowser,
    CompendiumBrowserIndexData,
    EquipmentFilters,
    ErrorPF2e,
    ExtractSocketOptions,
    ItemPF2e,
    ItemTransferDialog,
    LootPF2e,
    LootSheetPF2e,
    MacroPF2e,
    PhysicalItemPF2e,
    R,
    TokenDocumentPF2e,
    TokenPF2e,
    addItemsToActor,
    addListener,
    addListenerAll,
    arrayIncludes,
    calculateItemPrice,
    confirmDialog,
    createCallOrEmit,
    createHTMLElement,
    createTransferMessage,
    elementDataset,
    filterTraits,
    getHighestName,
    getInputValue,
    getTransferData,
    hasSufficientCoins,
    htmlClosest,
    htmlQuery,
    htmlQueryInClosest,
    isInstanceOf,
    promptDialog,
    renderActorSheets,
    renderApplication,
    toggleSummaryElement,
    updateTransferSource,
    wrapperError,
} from "module-helpers";
import { ModuleMigration } from "module-helpers/dist/migration";
import { createTool } from "../tool";
import { updateItemTransferDialog } from "./shared/item-transfer-dialog";

const INFINITY = "∞";

const DEFAULT_SERVICE_ICON = "icons/commodities/currency/coins-plain-stack-gold.webp";

const PULL_LIMIT = 100;

const RATIO = {
    buy: {
        min: 0,
        max: 2,
        default: 0.5,
    },
    sell: {
        min: 0,
        max: 5,
        default: 1,
    },
    services: {
        min: 0,
        max: 5,
        default: 1,
    },
};

const ITEM_PREPARE_DERIVED_DATA = "CONFIG.Item.documentClass.prototype.prepareDerivedData";

const MIGRATION_225: ModuleMigration = {
    version: 2.25,
    migrateActor: (actorSource) => {
        if (actorSource.type !== "loot") return false;

        const flag = getFlagProperty(actorSource);
        if (!R.isPlainObject(flag) || !R.isPlainObject(flag.filters)) return false;

        const setCheckbox = (
            checkbox: Partial<{
                options: Record<string, { selected: boolean }>;
                selected: string[];
            }>
        ) => {
            if (!R.isArray(checkbox.selected)) return;

            checkbox.options ??= {};

            for (const selection of checkbox.selected) {
                checkbox.options[selection] ??= { selected: true };
            }

            return checkbox;
        };

        for (const type of ["buy", "sell"]) {
            const typeFilters = flag.filters[type];
            if (!R.isArray(typeFilters)) {
                flag.filters[`-=${type}`] = true;
                continue;
            }

            flag.filters[type] = R.pipe(
                foundry.utils.deepClone(typeFilters),
                R.filter(
                    (typeFilters): typeFilters is { filter: { [k: string]: unknown } } =>
                        R.isPlainObject(typeFilters) && R.isPlainObject(typeFilters.filter)
                ),
                R.map((typeFilter) => {
                    const filter = typeFilter.filter;

                    if ("order" in filter) {
                        delete filter.order;
                    }

                    if (R.isPlainObject(filter.checkboxes)) {
                        if (R.isPlainObject(filter.checkboxes.source)) {
                            filter.source = setCheckbox(filter.checkboxes.source);
                            delete filter.checkboxes.source;
                        }

                        for (const checkbox of Object.values(filter.checkboxes)) {
                            setCheckbox(checkbox as any);
                        }
                    }

                    if (R.isPlainObject(filter.multiselects)) {
                        if ("traits" in filter.multiselects) {
                            filter.traits = filter.multiselects.traits;
                        }
                        delete filter.multiselects;
                    }

                    if (R.isPlainObject(filter.sliders)) {
                        if (
                            R.isPlainObject(filter.sliders.level) &&
                            R.isPlainObject(filter.sliders.level.values)
                        ) {
                            const level = filter.sliders.level.values;

                            filter.level = {
                                changed: true,
                                from: level.min ?? 0,
                                to: level.max ?? 20,
                            };
                        }
                        delete filter.sliders;
                    }

                    return typeFilter;
                })
            );
        }

        return true;
    },
};

const {
    config,
    settings,
    wrappers,
    localize,
    socket,
    hook,
    getFlag,
    setFlag,
    setFlagProperty,
    render,
    getFlagProperty,
    getInMemory,
    setInMemory,
    deleteInMemory,
    waitDialog,
} = createTool({
    name: "betterMerchant",
    settings: [
        {
            key: "enabled",
            type: Boolean,
            default: false,
            requiresReload: true,
        },
        {
            key: "servicesTop",
            type: Boolean,
            default: true,
            onChange: () => {
                renderActorSheets("LootSheetPF2e");
            },
        },
        {
            key: "buyMax",
            type: Number,
            default: RATIO.buy.max,
            range: {
                min: 0,
                max: 9,
                step: 1,
            },
            onChange: () => {
                renderActorSheets("LootSheetPF2e");
                renderApplication("FiltersMenu");
            },
        },
        {
            key: "sellMax",
            type: Number,
            default: RATIO.sell.max,
            range: {
                min: 0,
                max: 9,
                step: 1,
            },
            onChange: () => {
                renderActorSheets("LootSheetPF2e");
                renderApplication("FiltersMenu");
            },
        },
        {
            key: "servicesMax",
            type: Number,
            default: RATIO.services.max,
            range: {
                min: 0,
                max: 9,
                step: 1,
            },
            onChange: () => {
                renderActorSheets("LootSheetPF2e");
                renderApplication("FiltersMenu");
            },
        },
    ],
    hooks: [
        {
            event: "renderItemTransferDialog",
            listener: onRenderItemTransferDialog,
        },
    ],
    wrappers: [
        {
            key: "actorTransferItem",
            path: "CONFIG.Actor.documentClass.prototype.transferItemToActor",
            callback: actorTransferItemToActor,
        },
        {
            key: "lootSheetRenderInner",
            path: "CONFIG.Actor.sheetClasses.loot['pf2e.LootSheetPF2e'].cls.prototype._renderInner",
            callback: lootSheetPF2eRenderInner,
        },
        {
            key: "lootSheetListeners",
            path: "CONFIG.Actor.sheetClasses.loot['pf2e.LootSheetPF2e'].cls.prototype.activateListeners",
            callback: lootSheetPF2eActivateListeners,
        },
        {
            key: "lootActorTransfer",
            path: "CONFIG.PF2E.Actor.documentClasses.loot.prototype.transferItemToActor",
            callback: lootActorTransferItemToActor,
            type: "OVERRIDE",
        },
        {
            key: "browserOnFirstRender",
            path: "game.pf2e.compendiumBrowser.constructor.prototype._onFirstRender",
            callback: browserOnFirstRender,
        },
        {
            key: "browserOnClose",
            path: "game.pf2e.compendiumBrowser.constructor.prototype._onClose",
            callback: browserOnClose,
        },
        {
            key: "itemDerivedData",
            path: ITEM_PREPARE_DERIVED_DATA,
            callback: itemPrepareDerivedData,
        },
    ],
    api: {
        testItem,
        compareItemWithFilter,
    },
    migrations: [MIGRATION_225],
    onSocket: (packet: BetterMerchantPacket, userId: string) => {
        switch (packet.type) {
            case "buy":
                tradeRequest(packet);
                break;
            case "service":
                serviceRequest(packet);
                break;
        }
    },
    init: () => {
        if (!settings.enabled) return;

        wrappers.itemDerivedData.activate();
        wrappers.actorTransferItem.activate();
        wrappers.lootActorTransfer.activate();
    },
    ready: (isGM) => {
        if (!settings.enabled) return;

        hook.activate();

        wrappers.lootSheetRenderInner.activate();
        wrappers.lootSheetListeners.activate();

        if (isGM) {
            socket.activate();

            wrappers.browserOnFirstRender.activate();
            wrappers.browserOnClose.activate();
        }
    },
} as const);

const tradeRequest = createCallOrEmit("buy", buyItem, socket);
const serviceRequest = createCallOrEmit("service", sellService, socket);

function onRenderItemTransferDialog(app: ItemTransferDialog, $html: JQuery) {
    const thisActor = app.item.actor;
    const targetActor = app.options.targetActor;

    if (
        app.options.isPurchase ||
        !thisActor?.isOfType("npc", "character", "party") ||
        !targetActor?.isOfType("loot") ||
        !targetActor.isMerchant ||
        !thisActor.isOwner ||
        (!game.user.isGM && targetActor.isOwner)
    )
        return;

    updateItemTransferDialog(
        app,
        $html,
        "PF2E.loot.SellSubtitle",
        localize.path("buy.question"),
        true
    );
}

/**
 * the merchant is selling stuff to a character/npc
 */
async function lootActorTransferItemToActor(this: LootPF2e, ...args: ActorTransferItemArgs) {
    const [targetActor, item, quantity] = args;
    const thisSuper = getDocumentClass("Actor").prototype;

    if (!this.isMerchant || !item.isOfType("physical") || !this.isOwner || !targetActor.isOwner) {
        return thisSuper.transferItemToActor.apply(this, args);
    }

    // we need to check that the actor still has the same stock
    const realQuatity = Math.min(quantity, item.quantity);
    const itemFilter = testItem(this, item, "sell", realQuatity);

    if (!itemFilter) {
        localize.warn("sell.refuse", {
            actor: this.name,
            item: item.name,
        });
        return null;
    }

    // we update the quantity
    args[2] = realQuatity;

    const transferedItem = await thisSuper.transferItemToActor.apply(this, args);
    if (!transferedItem) return null;

    const itemValue = game.pf2e.Coins.fromPrice(item.price, realQuatity);
    const goldValue = itemValue.goldValue;
    const filters = getFlag<ItemFilter[]>(this, "filters", "sell")?.slice() ?? [];
    const defaultFilter = getFlag<Partial<ItemFilter>>(this, "default", "sell");
    const updates = setFlagProperty(
        {},
        "default.sell.purse",
        (defaultFilter?.purse ?? 0) + goldValue
    );

    if (itemFilter.filter.id !== "default") {
        const filterIndex = filters.findIndex((x) => x.id === itemFilter.filter.id);

        if (filterIndex !== -1) {
            itemFilter.filter.purse += goldValue;
            filters.splice(filterIndex, 1, itemFilter.filter);

            setFlagProperty(updates, "filters.sell", filters);
        }
    }

    await this.update(updates);
    return transferedItem;
}

/**
 * selling stuff to the merchant
 */
async function actorTransferItemToActor(
    this: ActorPF2e,
    ...args: ActorTransferItemArgs
): Promise<PhysicalItemPF2e | null | undefined> {
    const isGM = game.user.isGM;
    const [targetActor, item, quantity = 1] = args;
    const isParty = this.isOfType("party");
    const isCreature = this.isOfType("npc", "character");

    if (
        !targetActor.isOfType("loot") ||
        !targetActor.isMerchant ||
        (!isGM && targetActor.isOwner) ||
        (!isCreature && !isParty) ||
        (isCreature && !this.isOwner && !this.hasPlayerOwner) ||
        (isParty && !this.members.some((x) => x.hasPlayerOwner && x.isOwner))
    )
        // we don't process anything, so we return undefined
        return undefined;

    const realQuantity = Math.min(quantity, item.quantity);
    const itemFilter = testItem(targetActor, item, "buy", realQuantity);

    if (!itemFilter) {
        localize.warn("buy.refuse", {
            actor: targetActor.name,
            item: item.name,
            quantity: realQuantity === 1 ? "" : `x${realQuantity}`,
        });
    } else {
        tradeRequest({
            item,
            targetActor,
            quantity,
            filterId: itemFilter.filter.id,
            priceData: itemFilter.price.toObject(),
        });
    }

    // we return null to signal we take over the process of the item transfer
    return null;
}

async function buyItem(
    { filterId, item, priceData, targetActor, quantity }: BuyItemOptions,
    userId: string
) {
    const sendError = () => {
        localize.error("buy.error", { user: game.users.get(userId)?.name ?? "unknown" });
    };

    const sourceActor = item.actor;
    const filters = targetActor ? getFilters(targetActor as LootPF2e, "buy", true) : [];
    const filter = filters.find((x) => x.id === filterId);

    if (
        !filter ||
        !targetActor.isOfType("loot") ||
        !sourceActor.isOfType("npc", "character", "party")
    ) {
        return sendError();
    }

    const transferData = await getTransferData({ item, quantity });

    if (!transferData) {
        return sendError();
    }

    const items = await addItemsToActor({ ...transferData, targetActor });

    if (!items) {
        return sendError();
    }

    await updateTransferSource({ item, quantity: transferData.quantity });

    const updates = {};
    const defaultFilter = filters.pop()!;
    const price = new game.pf2e.Coins(priceData);
    const goldValue = price.goldValue;

    if (defaultFilter.purse !== Infinity && (filter.useDefault || filter.id === "default")) {
        setFlagProperty(updates, "default.buy.purse", defaultFilter.purse - goldValue);
    }

    if (filter.id !== "default" && filter.purse !== Infinity) {
        const filterIndex = filters.findIndex((x) => x.id === filter.id);
        filter.purse -= goldValue;
        filters.splice(filterIndex, 1, filter);
        setFlagProperty(updates, "filters.buy", filters);
    }

    await targetActor.update(updates);
    await sourceActor.inventory.addCoins(price);

    createTransferMessage({
        item: items.item,
        sourceActor: item.actor,
        targetActor,
        quantity: transferData.quantity,
        userId,
        subtitle: game.i18n.localize("PF2E.loot.SellSubtitle"),
        message: "PF2E.loot.SellMessage",
    });
}

function itemPrepareDerivedData(this: ItemPF2e, wrapped: libWrapper.RegisterCallback) {
    wrapped();

    try {
        if (!this.isOfType("physical") || this.isOfType("treasure")) return;

        const actor = this.actor;
        if (!actor?.isOfType("loot") || !actor.isMerchant) return;

        deleteInMemory(this);

        const infinite = getFlag<boolean>(actor, "infiniteAll");
        const itemFilter = testItem(actor, this, "sell", this.system.price.per);

        if (infinite) {
            this.system.quantity = 9999;
        }

        if (itemFilter && itemFilter.filter.ratio !== 1) {
            this.system.price.value = itemFilter.price;
            setInMemory(this, "filter", itemFilter.filter.id);
        }
    } catch (error) {
        wrapperError(ITEM_PREPARE_DERIVED_DATA, error);
    }
}

function testItem(actor: LootPF2e, item: PhysicalItemPF2e, type: ItemFilterType, quantity = 1) {
    const itemFilters = getFilters(actor, type, true);
    const defaultFilter = itemFilters.pop()!;

    for (const itemFilter of itemFilters) {
        const { enabled, ratio, purse, useDefault, filter } = itemFilter;
        if (!enabled) continue;

        const price = calculateItemPrice(item, quantity, ratio);
        const goldPrice = price.goldValue;

        if (type === "buy") {
            if (purse < goldPrice) continue;
            if (useDefault && defaultFilter.purse < goldPrice) continue;
        }

        if (!compareItemWithFilter(item, filter)) continue;

        return { price, filter: itemFilter };
    }

    if (!defaultFilter.enabled) return;

    const ratio = type === "buy" && item.isOfType("treasure") ? 1 : defaultFilter.ratio;
    const price = calculateItemPrice(item, quantity, ratio);
    if (type === "buy" && defaultFilter.purse < price.goldValue) return;

    return { price, filter: defaultFilter };
}

function compareItemWithFilter(item: PhysicalItemPF2e, filter: Partial<EquipmentFilters>) {
    if (filter.search?.text) {
        const itemName = item.name.toLocaleLowerCase(game.i18n.lang);
        const wordSegmenter =
            "Segmenter" in Intl
                ? new Intl.Segmenter(game.i18n.lang, { granularity: "word" })
                : {
                      segment(term: string): { segment: string }[] {
                          return [{ segment: term }];
                      },
                  };
        const segments = Array.from(wordSegmenter.segment(filter.search.text))
            .map((t) => t.segment.toLocaleLowerCase(game.i18n.lang).replace(/['"]/g, ""))
            .filter((t) => t.length > 1);
        const nameChecks = segments.some((segment) => itemName.includes(segment));

        if (!nameChecks) return false;
    }

    const { checkboxes, ranges, source, traits, level } = filter;

    // Level
    const itemLevel = item.level;
    if (level && (itemLevel < level.from || itemLevel > level.to)) {
        return false;
    }

    // Price
    const filterPrice = ranges?.price?.values;
    const priceInCopper = item.price.value.copperValue;
    if (filterPrice && (priceInCopper < filterPrice.min || priceInCopper > filterPrice.max)) {
        return false;
    }

    // Item type
    const filterItemTypes = checkboxes?.itemTypes?.selected;
    if (filterItemTypes?.length && !filterItemTypes.includes(item.type)) {
        return false;
    }

    const itemCategory = "category" in item ? (item.category as string) : "";
    const itemGroup = "group" in item ? (item.group as string) : "";

    // Armor
    const filterArmorTypes = checkboxes?.armorTypes?.selected;
    if (filterArmorTypes?.length && !arrayIncludes(filterArmorTypes, [itemCategory, itemGroup])) {
        return false;
    }

    // Weapon categories
    const filterWeaponTypes = checkboxes?.weaponTypes?.selected;
    if (filterWeaponTypes?.length && !arrayIncludes(filterWeaponTypes, [itemCategory, itemGroup])) {
        return false;
    }

    // Traits
    if (traits && !filterTraits([...item.traits], traits.selected, traits.conjunction)) {
        return false;
    }

    // Source
    const filterSource = source?.selected;
    const itemSource = game.pf2e.system.sluggify(item.system.publication?.title ?? "").trim();
    if (filterSource?.length && !filterSource.includes(itemSource)) {
        return false;
    }

    // Rarity
    const filterRarity = checkboxes?.rarity?.selected;
    if (filterRarity?.length && !filterRarity.includes(item.rarity)) {
        return false;
    }

    return true;
}

async function browserOnClose(
    this: CompendiumBrowser,
    wrapped: libWrapper.RegisterCallback,
    ...args: any[]
) {
    deleteInMemory(this);
    wrapped(...args);
}

function browserOnFirstRender(
    this: CompendiumBrowser,
    wrapped: libWrapper.RegisterCallback,
    ...args: any[]
) {
    wrapped(...args);

    const data = getInMemory<BrowserData>(this);
    if (!data?.actor.isMerchant) return;

    const html = this.element;
    const controls = htmlQuery(html, ".window-header [data-action='toggleControls']");

    html.classList.add("toolbelt-merchant");

    (async () => {
        const label =
            data.type === "pull"
                ? localize("browserPull.add")
                : localize("browserFilter", data.edit ? "edit" : "create", {
                      type: localize("filter", data.filterType),
                  });

        const btn = createHTMLElement("button", {
            classes: ["header-button"],
            innerHTML: label,
        });

        btn.addEventListener("click", async (event) => {
            this.close();

            const tab = this.tabs.equipment;

            if (data.type === "pull") {
                new BrowserPullMenu(data.actor, tab.results).render(true);
            } else {
                const filters = getFilters(data.actor, data.filterType, false) as ItemFilterBase[];
                const filter: Partial<EquipmentFilters> = foundry.utils.diffObject(
                    await tab.getFilterData(),
                    tab.filterData
                );

                delete filter.order;

                if (data.edit) {
                    const itemFilter = filters.find((x) => x.id === data.edit);

                    if (itemFilter) {
                        itemFilter.filter = filter;
                        setFilters(data.actor, data.filterType, filters);
                        return;
                    }
                }

                const id = foundry.utils.randomID();
                const itemFilter: ItemFilter = {
                    id,
                    name: id,
                    enabled: true,
                    filter,
                    useDefault: true,
                };

                filters.unshift(itemFilter);
                setFilters(data.actor, data.filterType, filters);
            }
        });

        controls?.replaceWith(btn);
    })();
}

class BrowserPullMenu extends foundry.applications.api.ApplicationV2 {
    #actor: LootPF2e;
    #owned: string[];
    #selection: string[] = [];
    #results: CompendiumBrowserIndexData[];

    static DEFAULT_OPTIONS: DeepPartial<ApplicationConfiguration> = {
        position: {
            width: 600,
        },
        classes: ["pf2e-toolbelt-better-merchant-browserPull"],
    };

    constructor(
        actor: LootPF2e,
        results: CompendiumBrowserIndexData[],
        options: DeepPartial<ApplicationConfiguration> = {}
    ) {
        options.window ??= {};
        options.window.title = localize("browserPull.title", { name: actor.name });

        super(options);

        this.#actor = actor;
        this.#results = results;

        this.#owned = R.pipe(
            actor.inventory.contents,
            R.map((item) => item.sourceId),
            R.filter(R.isTruthy)
        );

        this.#selectToLimit();
    }

    get selected() {
        return this.#selection.length;
    }

    async _prepareContext(options: ApplicationRenderOptions): Promise<BrowserPullMenuContext> {
        return {
            owned: this.#owned,
            results: this.#results,
        };
    }

    _renderHTML(
        context: ApplicationRenderContext,
        options: ApplicationRenderOptions
    ): Promise<string> {
        return render("browserPull", context);
    }

    protected _onFirstRender(context: object, options: ApplicationRenderOptions): void {
        this.#updateCheckboxes();
    }

    _replaceHTML(result: string, content: HTMLElement, options: ApplicationRenderOptions): void {
        content.innerHTML = result;
        this.#activateListeners(content);
    }

    #updateCheckboxes() {
        const itemsUl = htmlQuery(this.element, "ul");
        const countEl = htmlQuery(this.element, ".header .count");
        if (!itemsUl || !countEl) return;

        const selected = this.selected;
        const isAtLimit = selected >= PULL_LIMIT;

        // count

        countEl.textContent = String(selected);

        // select inputs

        let element: Element;
        const iterator = document.createNodeIterator(itemsUl, NodeFilter.SHOW_ELEMENT);

        while ((element = iterator.nextNode() as Element)) {
            if (!(element instanceof HTMLInputElement)) continue;

            const checked = this.#selection.includes(element.dataset.uuid!);

            element.checked = checked;
            element.disabled = !checked && isAtLimit;
        }
    }

    #selectToLimit() {
        this.#selection.length = 0;

        for (const { uuid } of this.#results) {
            if (this.#owned.includes(uuid)) continue;
            this.#selection.push(uuid);
            if (this.#selection.length >= PULL_LIMIT) break;
        }
    }

    #activateListeners(html: HTMLElement) {
        addListener(html, "[data-action='toggle-all']", () => {
            if (this.selected === 0) {
                this.#selectToLimit();
            } else {
                this.#selection.length = 0;
            }

            this.#updateCheckboxes();
        });

        addListener(html, "[data-action='add-to-merchant']", () => {
            this.#addToMerchant();
            this.close();
        });

        addListenerAll(html, "[name='selected-item']", "change", (event, el: HTMLInputElement) => {
            const uuid = el.dataset.uuid!;

            if (el.checked) {
                this.#selection.push(uuid);
            } else {
                this.#selection.findSplice((x) => x === uuid);
            }

            this.#updateCheckboxes();
        });
    }

    async #addToMerchant() {
        const selection = this.#selection.slice();
        if (selection.length === 0) return;

        const actor = this.#actor;
        const message = localize("browserPull.confirm", { nb: selection.length });
        const confirm = await confirmDialog({
            title: `${localize("sheet.browser")} - ${actor.name}`,
            content: `<div style="margin-bottom: 0.5em;">${message}</div>`,
        });
        if (!confirm) return;

        const groups: string[][] = [];

        while (selection.length) {
            const uuids = selection.splice(0, 10);
            groups.push(uuids);
        }

        await Promise.all(
            groups.map(async (uuids) => {
                const sources = R.pipe(
                    await Promise.all(uuids.map((uuid) => fromUuid<ItemPF2e>(uuid))),
                    R.filter((item): item is PhysicalItemPF2e => !!item?.isOfType("physical")),
                    R.map((item) => item.toObject())
                );
                return actor.createEmbeddedDocuments("Item", sources);
            })
        );

        localize.info("browserPull.finished");
    }
}

async function lootSheetPF2eRenderInner(
    this: LootSheetPF2e<LootPF2e>,
    wrapped: libWrapper.RegisterCallback,
    data: LootSheetDataPF2e
) {
    const $html = (await wrapped(data)) as JQuery;

    const actor = this.actor;
    if (!actor?.isMerchant) return $html;

    const isGM = game.user.isGM;
    const html = $html[0];
    const infiniteAll = !!getFlag<boolean>(actor, "infiniteAll");
    const servicesRatio = getServicesRatio(actor);
    const inventoryList = htmlQuery(html, ".sheet-body .inventory-list");

    if (isGM) {
        const sheetElement = createHTMLElement("div", {
            classes: ["gm-settings", "better-merchant"],
            innerHTML: await render("sheet", {
                infiniteAll,
                servicesRatio: {
                    ...RATIO.services,
                    max: settings.servicesMax,
                    value: servicesRatio,
                },
            }),
        });
        htmlQuery(html, ".sheet-sidebar .image-container")?.after(sheetElement);
    }

    const itemFilters = isGM ? getFilters(actor, "sell", true) : false;
    const itemElements = inventoryList?.querySelectorAll<HTMLElement>(".items > [data-item-id]");

    for (const itemElement of itemElements ?? []) {
        const { itemId } = elementDataset(itemElement);
        const item = actor.items.get(itemId);
        if (!item) continue;

        if (itemFilters) {
            const filterId = getInMemory<string>(item, "filter");
            const filter = itemFilters.find((x) => x.id === filterId);

            if (filter) {
                const priceElement = htmlQuery(itemElement, ".price");

                if (priceElement) {
                    priceElement.classList.add(filter.ratio < 1 ? "cheap" : "expensive");
                    priceElement.dataset.tooltip = `${filter.name} (${filter.ratio})`;
                }
            }
        }

        if (infiniteAll) {
            const quantityElement = htmlQuery(itemElement, ".quantity");
            if (quantityElement) quantityElement.innerHTML = INFINITY;
        }
    }

    if (isGM && infiniteAll) {
        const bulkElement = htmlQuery(html, ".total-bulk span");
        const wealthElement = htmlQuery(html, ".coinage .wealth .item-name:last-child span");

        if (bulkElement) {
            bulkElement.innerHTML = game.i18n.format("PF2E.Actor.Inventory.TotalBulk", {
                bulk: INFINITY,
            });
        }
        if (wealthElement) {
            wealthElement.innerHTML = INFINITY;
        }
    }

    const servicesAll = getServices(actor);
    const userServices = isGM
        ? servicesAll
        : servicesAll.filter((service) => !!serviceCanBePurchased(service));

    if (isGM || userServices.length) {
        return this.itemRenderer.saveAndRestoreState(async () => {
            const services: ServiceData[] = [];

            for (const service of userServices) {
                const enrichedService = await enrichService(service, servicesRatio);
                services.push(enrichedService);
            }

            const servicesTemplate = await render("sheet-services", {
                services,
                infinity: INFINITY,
                isGM,
                css: servicesRatio > 1 ? "expensive" : servicesRatio < 1 ? "cheap" : "",
            });

            const servicesElement = createHTMLElement("div", { innerHTML: servicesTemplate });

            if (settings.servicesTop) {
                inventoryList?.prepend(...servicesElement.children);
            } else {
                inventoryList?.append(...servicesElement.children);
            }

            return $html;
        });
    }

    return $html;
}

function lootSheetPF2eActivateListeners(
    this: LootSheetPF2e<LootPF2e>,
    wrapped: libWrapper.RegisterCallback,
    $html: JQuery
) {
    wrapped($html);

    const actor = this.actor;
    if (!actor?.isMerchant) return;

    const html = $html[0];

    const betterMenu = htmlQuery(html, ".better-merchant");
    if (betterMenu) {
        addListener(betterMenu, "[name='infiniteAll']", "change", (event, el: HTMLInputElement) => {
            const value = el.checked;
            setFlag(actor, "infiniteAll", value);
        });

        addListener(
            betterMenu,
            "[name='servicesRatio']",
            "change",
            (even, el: HTMLInputElement) => {
                setFlag(actor, "servicesRatio", el.valueAsNumber);
            }
        );
    }

    addListenerAll(html, "[data-better-action]:not(.disabled)", async (event, el) => {
        const action = el.dataset.betterAction as LootSheetActionEvent;

        switch (action) {
            case "open-filters-menu": {
                return new FiltersMenu(actor).render(true);
            }

            case "open-equipment-tab": {
                return openEquipmentTab({ actor, type: "pull" });
            }

            case "create-service": {
                return addService(actor);
            }

            case "export-services": {
                return exportServices(this.actor);
            }

            case "import-services": {
                return importServices(this.actor);
            }

            case "edit-service": {
                const serviceId = htmlClosest(el, "[data-service-id]")?.dataset.serviceId;

                if (serviceId) {
                    editService(actor, serviceId);
                }

                break;
            }

            case "delete-service": {
                const confirm = await confirmDialog({
                    title: localize("service.delete.title"),
                    content: localize("service.delete.msg"),
                });
                if (!confirm) return;

                const services = getServices(actor).slice();
                const serviceId = htmlClosest(el, "[data-service-id]")?.dataset.serviceId;
                services.findSplice((service) => service.id === serviceId);

                return await setServices(actor, services);
            }

            case "toggle-service-summary": {
                const summaryEl = htmlQueryInClosest(el, "[data-service-id]", ".item-summary");

                if (summaryEl) {
                    toggleSummaryElement(summaryEl);
                }

                break;
            }

            case "service-to-chat": {
                const serviceId = htmlClosest(el, "[data-service-id]")?.dataset.serviceId;
                const service = serviceId ? getService(actor, serviceId) : undefined;
                if (!service) return;

                return await serviceMessage(actor, service, actor, { token: this.token });
            }

            case "toggle-service-enabled": {
                const services = getServices(actor).slice();
                const serviceId = htmlClosest(el, "[data-service-id]")?.dataset.serviceId;

                const service = services.find((service) => service.id === serviceId);
                if (!service) return;

                service.enabled = !service.enabled;
                return await setServices(actor, services);
            }

            case "buy-service":
            case "give-service": {
                const serviceId = htmlClosest(el, "[data-service-id]")?.dataset.serviceId;

                if (serviceId) {
                    onBuyService({ actor }, serviceId, action === "give-service");
                }

                break;
            }

            case "decrease-service":
            case "increase-service": {
                const services = getServices(actor).slice();
                const serviceId = htmlClosest(el, "[data-service-id]")?.dataset.serviceId;

                const service = services.find((service) => service.id === serviceId);
                if (!service) return;

                const current = service.quantity ?? -1;
                const change = action === "increase-service" ? 1 : -1;

                service.quantity = Math.max(current + change, -1);

                return await setServices(actor, services);
            }
        }
    });
}

function isValidServiceBuyer(actor: Maybe<ClientDocument>): actor is ActorPF2e {
    return (
        isInstanceOf(actor, "ActorPF2e") &&
        actor.isOfType("npc", "character", "party") &&
        actor.isOwner
    );
}

async function onBuyService(seller: ServiceTradeData, serviceId: string, forceFree: boolean) {
    if (!seller.actor?.isOfType("loot")) return;

    const service = getService(seller.actor, serviceId);
    if (!service?.enabled) return;

    const buyer: ServiceTradeData | undefined = (() => {
        const selected = R.only(canvas.tokens.controlled);

        if (isValidServiceBuyer(selected?.actor)) {
            return { actor: selected.actor, token: selected };
        } else {
            const character = game.user.character;

            if (isValidServiceBuyer(character)) {
                return { actor: character };
            }
        }
    })();

    if (!buyer) {
        return localize.warn("service.noBuyer");
    }

    const notifyData = {
        buyer: getHighestName(buyer.actor),
        seller: getHighestName(seller.actor),
    };

    if (!forceFree && service.quantity === 0) {
        return localize.warn("service.noStock", notifyData);
    }

    const price = getServicePrice(service, getServicesRatio(seller.actor));
    const isFree = forceFree || price.copperValue <= 0;

    if (!isFree && !hasSufficientCoins(buyer.actor, price)) {
        return localize.warn("service.noFunds", notifyData);
    }

    const trader = forceFree ? seller : buyer;

    serviceRequest({
        forceFree,
        serviceId,
        traderActor: trader.actor,
        traderToken: trader.token,
        sellerActor: seller.actor,
    });
}

async function sellService(
    { traderActor, traderToken, sellerActor, serviceId, forceFree }: ServiceOptions,
    userId: string
) {
    const sendError = () => {
        localize.error("service.error");
    };

    if (!sellerActor.isOfType("loot") || !isValidServiceBuyer(traderActor)) {
        return sendError();
    }

    const services = getServices(sellerActor);
    const service = services.find((service) => service.id === serviceId);
    if (!service) {
        return sendError();
    }

    const serviceRatio = getServicesRatio(sellerActor);
    const originalPrice = getServicePrice(service);
    const usedPrice = forceFree
        ? null
        : serviceRatio === 1
        ? originalPrice
        : originalPrice.scale(serviceRatio);

    if (!forceFree) {
        if (!serviceCanBePurchased(service)) {
            return sendError();
        }

        const price = usedPrice!;
        const quantity = service.quantity ?? -1;

        if (price.copperValue > 0) {
            if (await traderActor.inventory.removeCoins(price)) {
                await sellerActor.inventory.addCoins(price);
            } else {
                return sendError();
            }
        }

        if (quantity > 0) {
            service.quantity = quantity - 1;
            await setServices(sellerActor, services);
        }
    }

    const macro = await getServiceMacro(service);
    macro?.execute({
        actor: traderActor,
        service: {
            seller: sellerActor,
            usedPrice,
            serviceRatio,
            originalPrice,
            name: service.name ?? service.id,
            level: service.level ?? 0,
            quantity: service.quantity ?? -1,
            forceFree: forceFree,
        },
    } satisfies ServiceMacroData);

    const msgOptions: ServiceMsgOptions = {
        token: traderToken,
        tradeMsg: localize("service", forceFree ? "give" : "buy", {
            buyer: getHighestName(traderActor),
            seller: getHighestName(sellerActor),
        }),
        userId,
    };

    return serviceMessage(traderActor, service, sellerActor, msgOptions);
}

async function serviceMessage(
    actor: ActorPF2e,
    service: ServiceFlag,
    seller: LootPF2e,
    { token, tradeMsg, userId }: ServiceMsgOptions = {}
) {
    token ??= actor.getActiveTokens(false, true).at(0);

    const ChatMessagePF2e = getDocumentClass("ChatMessage");
    const content = await render<ServiceCardData>("service-card", {
        actor,
        tokenId: token?.id,
        service: await enrichService(service, getServicesRatio(seller)),
        tradeMsg,
    });

    const msgData: ChatMessageCreateData<ChatMessagePF2e> = {
        author: userId ?? game.user.id,
        style: CONST.CHAT_MESSAGE_STYLES.OTHER,
        content,
        speaker: ChatMessagePF2e.getSpeaker({
            actor: actor,
            token: token instanceof Token ? token.document : token,
        }),
    };

    return ChatMessagePF2e.create(msgData);
}

function serviceCanBePurchased(service: ServiceFlag): service is ServiceFlag {
    return !!service.enabled && (service.quantity ?? -1) !== 0;
}

async function exportServices(actor: LootPF2e, services: ServiceFlag[] = getServices(actor)) {
    const contentServices = new Collection<ServiceExportData>();

    for (const service of services) {
        contentServices.set(service.id, {
            id: service.id,
            name: service.name ?? service.id,
            json: JSON.stringify(service),
        });
    }

    const onRender = (event: Event, html: HTMLDialogElement) => {
        addListenerAll(html, "[data-action='copy-service']", (event, el) => {
            const service = contentServices.get(el.dataset.serviceId ?? "");
            if (service) {
                game.clipboard.copyPlainText(service.json);
                localize.info("service-export.copied", { name: service.name });
            }
        });

        addListener(html, "[data-action='copy-all-service']", (event, el) => {
            const list = contentServices.map((service) => service.json);
            const text = `[${list.join(",")}]`;

            game.clipboard.copyPlainText(text);
            localize.info("service-export.copiedAll", { name: actor.name });
        });
    };

    promptDialog({
        title: localize("service-export.title", { name: actor.name }),
        content: await render<ServicesExportRenderData>("service-export", {
            services: contentServices,
            hasMany: contentServices.size > 1,
        }),
        classes: ["pf2e-toolbelt-services-export"],
        render: onRender,
        label: localize("service-export.close"),
    });
}

async function importServices(actor: LootPF2e) {
    const result = await waitDialog<{ raw: string }>("service-import", {
        title: localize("service-import.title", { name: actor.name }),
        content: "<textarea></textarea>",
        yes: "fa-solid fa-file-export",
        callback: async (event, options, html) => {
            return { raw: htmlQuery(html, "textarea")?.value ?? "{}" };
        },
    });

    if (!result?.raw.trim()) return;

    try {
        const parsed = JSON.parse(result.raw);
        const toAdd = R.pipe(
            Array.isArray(parsed) ? parsed : [parsed],
            R.map((service) => createService(service))
        );

        if (!toAdd.length) return;

        const services = getServices(actor);

        services.push(...toAdd);
        await setServices(actor, services);
    } catch (err) {
        localize.error("service-import.error");
        console.error(err);
    }
}

class ServiceMenu extends foundry.applications.api.ApplicationV2 {
    #actor: LootPF2e;
    #serviceId: string;

    static DEFAULT_OPTIONS: DeepPartial<ApplicationConfiguration> = {
        tag: "form",
        position: {
            width: 600,
        },
        form: {
            handler: ServiceMenu.myFormHandler,
            submitOnChange: true,
            closeOnSubmit: false,
        },
        classes: ["pf2e-toolbelt-better-merchant-service"],
        actions: {
            export: this.#export,
        },
    };

    static async #export(this: ServiceMenu, event: PointerEvent, target: HTMLElement) {
        const service = this.service;

        if (!service) {
            return localize.error("service.none");
        }

        game.clipboard.copyPlainText(JSON.stringify(service));
        localize.info("service-export.copied", { name: service.name ?? service.id });
    }

    static async myFormHandler(
        this: ServiceMenu,
        event: SubmitEvent | Event,
        form: HTMLFormElement,
        formData: FormDataExtended
    ) {
        const actor = this.actor;
        const formDataObject = formData.object as Omit<ServiceFlag, "price" | "img"> & {
            price: string;
        };

        const data: ServiceFlag = {
            ...formDataObject,
            img: htmlQuery<HTMLImageElement>(form, ".image")?.dataset.src ?? DEFAULT_SERVICE_ICON,
            price: game.pf2e.Coins.fromString(formDataObject.price),
        };

        const services = getServices(actor).slice();
        services.findSplice((service) => service.id === this.serviceId, data);

        await setServices(this.actor, services);
    }

    constructor(
        actor: LootPF2e,
        serviceId: string,
        options: DeepPartial<ApplicationConfiguration> = {}
    ) {
        options.window ??= {};
        options.window.title = localize("service.title", { name: actor.name });

        super(options);

        this.#actor = actor;
        this.#serviceId = serviceId;
    }

    get actor() {
        return this.#actor;
    }

    get serviceId() {
        return this.#serviceId;
    }

    get service() {
        return getService(this.actor, this.serviceId) ?? null;
    }

    async _renderFrame(options: ApplicationRenderOptions) {
        const frame = await super._renderFrame(options);

        const exportLabel = localize("service.export");
        const exportBtn = `<button type="button" class="header-control fa-regular fa-file-export" 
        data-action="export" data-tooltip="${exportLabel}" aria-label="${exportLabel}"></button>`;

        this.window.close.insertAdjacentHTML("beforebegin", exportBtn);

        return frame;
    }

    async _prepareContext(options: ServiceRenderOptions): Promise<ServiceContext> {
        const service = this.service;
        return {
            service: service ? await enrichService(service) : null,
        };
    }

    async _renderHTML(context: ServiceContext, options: ServiceRenderOptions) {
        return render("service", context);
    }

    _onFirstRender(context: ServiceContext, options: ServiceRenderOptions) {
        this.actor.apps[this.id] = this;
    }

    _onClose(options: ApplicationClosingOptions): void {
        delete this.actor.apps[this.id];
    }

    _replaceHTML(result: string, content: HTMLElement, options: ServiceRenderOptions) {
        content.innerHTML = result;
        this.#activateListeners(content);
    }

    #activateListeners(html: HTMLElement) {
        const service = this.service;
        if (!service) return;

        const submitOnChange = () => {
            if (this.options.form?.submitOnChange) {
                const submitEvent = new SubmitEvent("submit");
                this.element.dispatchEvent(submitEvent);
            }
        };

        addListenerAll(html, "[data-action]", async (event, el) => {
            const action = el.dataset.action as ServiceEventAction;

            switch (action) {
                case "open-macros": {
                    return ui.macros.renderPopout(true);
                }

                case "edit-image": {
                    const img = el as HTMLImageElement;

                    const filePicker = new FilePicker({
                        current: img.dataset.src,
                        type: "image",
                        callback: (path) => {
                            img.src = path;
                            img.dataset.src = path;
                            submitOnChange();
                        },
                    });

                    return filePicker.browse();
                }

                case "delete-macro": {
                    const macroInput = htmlQuery<HTMLInputElement>(html, "input[name='macroUUID']");
                    if (macroInput) {
                        macroInput.value = "";
                        submitOnChange();
                    }
                    break;
                }

                case "open-macro-sheet": {
                    const macro = await getServiceMacro(service);
                    macro?.sheet.render(true);
                    break;
                }
            }
        });

        addListener(html, ".service .header", "drop", async (event, el) => {
            try {
                const dataString = event.dataTransfer?.getData("text/plain");
                const dropData = JSON.parse(dataString ?? "");

                if (typeof dropData !== "object" || dropData.type !== "Macro") {
                    throw new Error();
                }

                const macro = (await getDocumentClass("Macro").fromDropData(dropData)) ?? null;
                if (!macro) throw new Error();

                const macroInput = htmlQuery<HTMLInputElement>(html, "input[name='macroUUID']");
                if (macroInput) {
                    macroInput.value = macro.uuid;
                    submitOnChange();
                }
            } catch {
                throw ErrorPF2e("Invalid item drop");
            }
        });
    }
}

async function addService(actor: LootPF2e) {
    const services = getServices(actor).slice();
    const service = createService(null);

    services.push(service);

    await setFlag(actor, "services", services);
    editService(actor, service.id);
}

function createService(raw: any): Required<ServiceFlag> {
    raw = R.isPlainObject(raw) ? raw : {};

    const id = foundry.utils.randomID();

    return {
        id,
        level: R.isNumber(raw.level) ? raw.level : 0,
        name: (R.isString(raw.name) && raw.name) || id,
        description: R.isString(raw.description) ? raw.description : "",
        price: new game.pf2e.Coins(raw.price as any),
        enabled: R.isBoolean(raw.enabled) ? raw.enabled : true,
        img: R.isString(raw.img) ? raw.img : "",
        quantity: R.isNumber(raw.quantity) ? raw.quantity : -1,
        macroUUID: R.isString(raw.macroUUID) ? raw.macroUUID : "",
    };
}

function editService(actor: LootPF2e, serviceId: string) {
    const service = getService(actor, serviceId);
    if (service) {
        new ServiceMenu(actor, serviceId).render(true);
    }
}

function getServices(actor: LootPF2e) {
    return getFlag<ServiceFlag[]>(actor, "services") ?? [];
}

function getService(actor: LootPF2e, serviceId: string) {
    return getServices(actor).find((service) => service.id === serviceId);
}

function getServicePrice(service: ServiceFlag, ratio: number = 1) {
    const price = new game.pf2e.Coins(service.price ?? {});
    return ratio === 1 ? price : price.scale(ratio);
}

function setServices(actor: LootPF2e, services: ServiceFlag[]) {
    return setFlag<ServiceFlag[]>(actor, "services", services);
}

async function getServiceMacro(service: ServiceFlag): Promise<MacroPF2e | null> {
    return service.macroUUID?.trim() ? fromUuid<MacroPF2e>(service.macroUUID) : null;
}

function getServicesRatio(actor: LootPF2e) {
    return Math.clamp(
        getFlag<number>(actor, "servicesRatio") ?? RATIO.services.default,
        RATIO.services.min,
        settings.servicesMax
    ).toNearest(0.01, "floor");
}

async function enrichService(service: ServiceFlag, ratio?: number): Promise<ServiceData> {
    const quantity = service.quantity ?? -1;
    const price = getServicePrice(service, ratio);
    const description = service.description?.trim() ?? "";

    return {
        id: service.id,
        name: service.name || service.id,
        description,
        enabled: service.enabled ?? true,
        level: service.level ?? 0,
        price,
        quantity,
        img: service.img?.trim() || DEFAULT_SERVICE_ICON,
        enrichedDescription: description ? await TextEditor.enrichHTML(description) : "",
        enrichedPrice: price.toString(),
        isInfinite: quantity < 0,
        macroUUID: service.macroUUID ?? "",
        macro: await getServiceMacro(service),
    };
}

class FiltersMenu extends foundry.applications.api.ApplicationV2 {
    #actor: LootPF2e;

    static DEFAULT_OPTIONS: DeepPartial<ApplicationConfiguration> = {
        classes: ["pf2e-toolbelt-better-merchant-filters"],
    };

    constructor(actor: LootPF2e, options: DeepPartial<ApplicationConfiguration> = {}) {
        options.window ??= {};
        options.window.title = localize("filters.title", actor);

        super(options);

        this.#actor = actor;

        actor.apps[this.appId] = this;
    }

    async _prepareContext(options: ApplicationRenderOptions): Promise<FiltersMenuContext> {
        const actor = this.#actor;
        const buyFilters = getFilters(actor, "buy", true);
        const sellFilters = getFilters(actor, "sell", true);

        const templateFilter = (filters: ExtractedFilter[]) => {
            const limit = filters.length - 1;
            return (filter: ExtractedFilter, index: number): TemplateFilter => ({
                ...filter,
                purse:
                    filter.purse === Infinity
                        ? undefined
                        : typeof filter.purse === "number"
                        ? Math.floor(filter.purse)
                        : filter.purse,
                cannotUp: index === 0 || index === limit,
                cannotDown: index >= limit - 1,
            });
        };

        return {
            buyFilters: buyFilters.map(templateFilter(buyFilters)),
            sellFilters: sellFilters.map(templateFilter(sellFilters)),
            ratios: R.mapValues(RATIO, (ratio, type) => {
                return {
                    ...ratio,
                    max: settings[`${type}Max`],
                };
            }),
        };
    }

    _renderHTML(
        context: ApplicationRenderContext,
        options: ApplicationRenderOptions
    ): Promise<string> {
        return render("filters", context);
    }

    _replaceHTML(result: string, content: HTMLElement, options: ApplicationRenderOptions): void {
        content.innerHTML = result;
        this.#activateListeners(content);
    }

    _onClose() {
        delete this.#actor.apps[this.appId];
    }

    #activateListeners(html: HTMLElement) {
        const browser = game.pf2e.compendiumBrowser;
        const tab = browser.tabs.equipment;
        const actor = this.#actor;

        const getItemData = (el: HTMLElement) => {
            const parent = htmlClosest(el, "[data-id]");
            const data = elementDataset<{ id: string; type: ItemFilterType }>(parent);
            const { type, id } = data;

            const itemFilters = getFilters(actor, type, true);
            const filterIndex = itemFilters.findIndex((x) => x.id === id);

            return {
                ...data,
                itemFilters,
                filterIndex,
            };
        };

        addListenerAll(html, "[data-action", async (even, el) => {
            const action = el.dataset.action as FiltersMenuEventAction;

            switch (action) {
                case "add-filter": {
                    const { type } = elementDataset<{ type: ItemFilterType }>(el);
                    openEquipmentTab({ actor, type: "filter", filterType: type, edit: false });
                    break;
                }

                case "move-filter": {
                    const { itemFilters, filterIndex, type } = getItemData(el);
                    const { direction } = elementDataset<{ direction: "up" | "down" }>(el);
                    const newIndex = direction === "up" ? filterIndex - 1 : filterIndex + 1;

                    if (newIndex < 0 || newIndex >= itemFilters.length) return;

                    const newFilters = R.swapIndices(itemFilters, filterIndex, newIndex);
                    setFilters(actor, type, newFilters);
                    break;
                }

                case "delete-filter": {
                    const { type, filterIndex, itemFilters } = getItemData(el);
                    if (filterIndex === -1) return;

                    const filter = itemFilters.at(filterIndex);
                    const confirm = await confirmDialog({
                        title: localize("filters.delete.title"),
                        content: localize("filters.delete.content", {
                            name: filter!.name || filter!.id,
                        }),
                    });

                    if (confirm) {
                        itemFilters.splice(filterIndex, 1);
                        setFilters(actor, type, itemFilters);
                    }
                    break;
                }

                case "edit-filter": {
                    const { type, id, filterIndex, itemFilters } = getItemData(el);
                    const defaultData = await tab.getFilterData();
                    const itemFilter = itemFilters.at(filterIndex)?.filter;
                    if (!itemFilter) return;

                    const filter = foundry.utils.mergeObject(defaultData, itemFilter);

                    if (itemFilter.ranges) {
                        for (const range of Object.values(filter.ranges)) {
                            range.isExpanded = true;
                        }
                    }

                    if (itemFilter.level) {
                        filter.level.isExpanded = true;
                    }

                    if (itemFilter.source) {
                        filter.source.isExpanded = true;
                    }

                    for (const key of Object.keys(itemFilter.checkboxes ?? {})) {
                        const checkbox = filter.checkboxes[key as keyof typeof filter.checkboxes];
                        if (checkbox) {
                            checkbox.isExpanded = true;
                        }
                    }

                    openEquipmentTab(
                        {
                            actor: actor,
                            type: "filter",
                            filterType: type,
                            edit: id,
                        },
                        filter
                    );
                    break;
                }
            }
        });

        addListenerAll(html, "input", "change", (event, el: HTMLInputElement) => {
            const { itemFilters, filterIndex, type } = getItemData(el);
            const filter = itemFilters.at(filterIndex);
            if (!filter) return;

            const key = el.name;
            const value = getInputValue(el);

            foundry.utils.setProperty(filter, key, value);
            setFilters(actor, type, itemFilters);
        });

        addListenerAll(html, "input[type='text'], input[type='number']", "keydown", (event, el) => {
            if (event.key === "Enter") {
                el.blur();
            }
        });
    }
}

async function openEquipmentTab(data: BrowserData, filters?: EquipmentFilters) {
    const browser = game.pf2e.compendiumBrowser;
    const tab = browser.tabs.equipment;

    deleteInMemory(browser);
    setInMemory(browser, data);

    browser.openTab("equipment", {
        filter: filters ?? (await tab.getFilterData()),
        hideNavigation: true,
    });
}

function getFilters<
    T extends ItemFilterType,
    F extends ItemFilter = T extends "buy" ? ItemFilterBuy : ItemFilterSell
>(actor: LootPF2e, type: T, withDefault: boolean): ExtractedFilter<F>[] {
    const filters = getFlag<F[]>(actor, "filters", type)?.slice() ?? [];

    if (withDefault) {
        const defaultFilter = getFlag<Partial<F>>(actor, "default", type) ?? {
            enabled: true,
        };

        filters.push({
            ...defaultFilter,
            id: "default",
            name: localize("filters.default", type),
            enabled: defaultFilter.enabled ?? true,
            locked: true,
            useDefault: true,
        } as F);
    }

    return filters.map((filter) => ({
        ...filter,
        name: filter.name.trim() || filter.id,
        ratio: clampPriceRatio(type, filter.ratio),
        purse:
            typeof filter.purse === "number"
                ? Math.max(0, filter.purse)
                : type === "buy"
                ? Infinity
                : 0,
    }));
}

function setFilters<
    T extends ItemFilterType,
    F extends ItemFilter = T extends "buy" ? ItemFilterBuy : ItemFilterSell
>(actor: LootPF2e, type: T, filters: F[]) {
    const updates = {};
    const defaultIndex = filters.findIndex((filter) => filter.id === "default");

    if (defaultIndex !== -1) {
        const defaultFilter = filters.splice(defaultIndex, 1)[0];

        setFlagProperty(updates, "default", type, {
            ratio: defaultFilter.ratio,
            purse: defaultFilter.purse,
            enabled: defaultFilter.enabled,
        });
    }

    setFlagProperty(updates, "filters", type, filters);

    return actor.update(updates);
}

function clampPriceRatio(type: ItemFilterType, value: number | undefined) {
    if (typeof value !== "number") return RATIO[type].default;
    return Math.clamp(value, RATIO[type].min, settings[`${type}Max`]).toNearest(0.01, "floor");
}

type ServiceEventAction = "open-macros" | "edit-image" | "open-macro-sheet" | "delete-macro";

type FiltersMenuEventAction = "add-filter" | "move-filter" | "delete-filter" | "edit-filter";

type LootSheetActionEvent =
    | "open-equipment-tab"
    | "open-filters-menu"
    | "create-service"
    | "toggle-service-summary"
    | "toggle-service-enabled"
    | "edit-service"
    | "delete-service"
    | "buy-service"
    | "give-service"
    | "service-to-chat"
    | "decrease-service"
    | "increase-service"
    | "export-services"
    | "import-services";

type ItemFilterType = "buy" | "sell";

type ItemFilter = ItemFilterBuy | ItemFilterSell;

type ItemFilterBase = {
    id: string;
    name: string;
    enabled: boolean;
    locked?: true;
    useDefault: boolean;
    ratio?: number;
    purse?: number | null;
    filter: Partial<EquipmentFilters>;
};

type ItemFilterBuy = ItemFilterBase & {};

type ItemFilterSell = ItemFilterBase & {};

type ExtractedFilter<F extends ItemFilter = ItemFilter> = Omit<F, "ratio" | "purse"> & {
    ratio: number;
    purse: number;
};

type ServiceTradeData = {
    actor: ActorPF2e;
    token?: TokenPF2e;
};

type ServiceCardData = {
    actor: ActorPF2e;
    tokenId: string | undefined;
    service: ServiceData;
    tradeMsg?: string;
};

type ServiceExportData = {
    id: string;
    name: string;
    json: string;
};

type ServicesExportRenderData = {
    services: Iterable<ServiceExportData>;
    hasMany: boolean;
};

type ServiceMsgOptions = {
    token?: TokenPF2e | TokenDocumentPF2e | null;
    tradeMsg?: string;
    userId?: string;
};

type ServiceData = Required<ServiceFlag> & {
    enrichedDescription: string;
    enrichedPrice: string;
    isInfinite: boolean;
    macro: Macro | null;
};

type ServiceFlag = {
    id: string;
    level?: number;
    name?: string;
    description?: string;
    price?: Coins;
    enabled?: boolean;
    img?: string;
    quantity?: number;
    macroUUID?: string;
};

type ServiceRenderOptions = ApplicationRenderOptions & {
    service: ServiceFlag | null;
};

type ServiceContext = {
    service: ServiceData | null;
};

type ServiceMacroData = {
    actor: ActorPF2e;
    service: {
        seller: LootPF2e;
        usedPrice: CoinsPF2e | null;
        serviceRatio: number;
        originalPrice: CoinsPF2e;
        name: string;
        level: number;
        quantity: number;
        forceFree: boolean;
    };
};

type BrowserPullMenuContext = {
    owned: string[];
    results: CompendiumBrowserIndexData[];
};

type FiltersMenuContext = {
    buyFilters: TemplateFilter[];
    sellFilters: TemplateFilter[];
    ratios: typeof RATIO;
};

type TemplateFilter = Omit<ExtractedFilter, "purse"> & {
    purse: number | undefined;
    cannotUp: boolean;
    cannotDown: boolean;
};

type BuyItemOptions = {
    filterId: string;
    priceData: Coins;
    targetActor: LootPF2e;
    item: PhysicalItemPF2e<ActorPF2e>;
    quantity: number;
};

type ServiceOptions = {
    traderActor: ActorPF2e;
    traderToken?: TokenPF2e | TokenDocumentPF2e;
    sellerActor: LootPF2e;
    serviceId: string;
    forceFree: boolean;
};

type BetterMerchantPacket =
    | ExtractSocketOptions<"buy", BuyItemOptions>
    | ExtractSocketOptions<"service", ServiceOptions>;

type BrowserData =
    | {
          type: "pull";
          actor: LootPF2e;
      }
    | {
          type: "filter";
          actor: LootPF2e;
          filterType: ItemFilterType;
          edit: string | false;
      };

export { config as betterMerchantTool };
