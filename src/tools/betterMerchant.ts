import {
    ErrorPF2e,
    R,
    TradeData,
    TradePacket,
    TranslatedTradeData,
    addListener,
    addListenerAll,
    calculateItemPrice,
    confirmDialog,
    createHTMLElement,
    createTradeMessage,
    elementDataset,
    enactTradeRequest,
    error,
    filterTraits,
    getHighestName,
    hasGMOnline,
    hasSufficientCoins,
    htmlClosest,
    htmlQuery,
    htmlQueryInClosest,
    isInstanceOf,
    libWrapper,
    promptDialog,
    renderActorSheets,
    sendTradeRequest,
    toggleSummaryElement,
    translateTradeData,
    userIsActiveGM,
    wrapperError,
} from "foundry-pf2e";
import { arrayIncludes } from "foundry-pf2e/src/utils";
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

const {
    config,
    settings,
    wrappers,
    localize,
    socket,
    hooks,
    getFlag,
    setFlag,
    setFlagProperty,
    render,
    getInMemory,
    getInMemoryAndSetIfNot,
    setInMemory,
    deleteInMemory,
    templatePath,
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
    ],
    hooks: [
        {
            event: "renderItemTransferDialog",
            listener: onRenderItemTransferDialog,
        },
        {
            event: "createChatMessage",
            listener: onCreateChatMessage,
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
            key: "browserRenderInner",
            path: "game.pf2e.compendiumBrowser.constructor.prototype._renderInner",
            callback: browserRenderInner,
        },
        {
            key: "browserEquipmentTabRenderResults",
            path: "game.pf2e.compendiumBrowser.tabs.equipment.constructor.prototype.renderResults",
            callback: browserEquipmentTabRenderResults,
        },
        {
            key: "browserListeners",
            path: "game.pf2e.compendiumBrowser.constructor.prototype.activateListeners",
            callback: browserActivateListeners,
        },
        {
            key: "browserClose",
            path: "game.pf2e.compendiumBrowser.constructor.prototype.close",
            callback: browserClose,
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
    onSocket: (packet: TradePacket<PacketData>, userId: string) => {
        const translated = translateTradeData(packet);
        buyItem(translated, userId);
    },
    init: () => {
        if (!settings.enabled) return;

        wrappers.itemDerivedData.activate();
        wrappers.actorTransferItem.activate();
        wrappers.lootActorTransfer.activate();
    },
    ready: (isGM) => {
        if (!settings.enabled) return;

        hooks.renderItemTransferDialog.activate();

        wrappers.lootSheetRenderInner.activate();
        wrappers.lootSheetListeners.activate();

        if (isGM) {
            socket.activate();

            hooks.createChatMessage.activate();

            wrappers.browserRenderInner.activate();
            wrappers.browserEquipmentTabRenderResults.activate();
            wrappers.browserListeners.activate();
            wrappers.browserClose.activate();
        }
    },
} as const);

async function onCreateChatMessage(message: ChatMessagePF2e) {
    if (!userIsActiveGM()) return;

    const serviceFlag = getFlag<ServiceMsgFlag>(message, "service");
    if (serviceFlag) {
        const errorUpdate = () => {
            const msgContent = createHTMLElement("div", { innerHTML: message.content });
            const cardContent = htmlQuery(msgContent, ".card-content") ?? msgContent;
            const errorMsg = localize("service.error");

            cardContent.innerHTML = `<p class="pf2e-toolbelt-service-error">${errorMsg}</p>`;
            return message.update({ content: msgContent.innerHTML });
        };

        const buyer = await fromUuid(serviceFlag.buyerUUID);
        const seller = await fromUuid(serviceFlag.sellerUUID);
        if (!isInstanceOf(seller, "LootPF2e") || !isValidServiceBuyer(buyer)) {
            return await errorUpdate();
        }

        const services = getServices(seller);
        const service = services.find((service) => service.id === serviceFlag.serviceId);
        if (!service) {
            return await errorUpdate();
        }

        const serviceRatio = getServicesRatio(seller);
        const originalPrice = getServicePrice(service);
        const usedPrice = serviceFlag.forceFree
            ? null
            : serviceRatio === 1
            ? originalPrice
            : originalPrice.scale(serviceRatio);

        if (!serviceFlag.forceFree) {
            if (!serviceCanBePurchased(service)) {
                return await errorUpdate();
            }

            const price = usedPrice!;
            const quantity = service.quantity ?? -1;

            if (price.copperValue > 0) {
                if (await buyer.inventory.removeCoins(price)) {
                    await seller.inventory.addCoins(price);
                } else {
                    return await errorUpdate();
                }
            }

            if (quantity > 0) {
                service.quantity = quantity - 1;
                await setServices(seller, services);
            }
        }

        const macro = await getServiceMacro(service);
        macro?.execute({
            actor: buyer,
            service: {
                seller,
                usedPrice,
                serviceRatio,
                originalPrice,
                name: service.name ?? service.id,
                level: service.level ?? 0,
                quantity: service.quantity ?? -1,
                forceFree: serviceFlag.forceFree,
            },
        } satisfies ServiceMacroData);
    }
}

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

    updateItemTransferDialog(app, $html, "PF2E.loot.SellSubtitle", localize.path("buy.question"));
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
        return null;
    }

    if (isGM) {
        return buyItem(
            {
                sourceActor: this,
                targetActor,
                sourceItem: item,
                quantity,
                filterId: itemFilter.filter.id,
                priceData: itemFilter.price.toObject(),
            },
            game.user.id
        );
    } else {
        sendTradeRequest(
            this,
            targetActor,
            item,
            { quantity, filterId: itemFilter.filter.id, priceData: itemFilter.price.toObject() },
            socket
        );
        return null;
    }
}

async function buyItem(translated: TranslatedTradeData<PacketData>, senderId: string) {
    const enacted = await enactTradeRequest(translated);
    if (!enacted) return null;

    const { filterId, priceData, sourceActor, targetActor, newItem } = enacted;
    const filters = targetActor ? getFilters(targetActor as LootPF2e, "buy", true) : [];
    const filter = filters.find((x) => x.id === filterId);

    if (
        !filter ||
        !targetActor.isOfType("loot") ||
        !sourceActor.isOfType("npc", "character", "party")
    ) {
        localize.error("buy.error", { user: game.users.get(senderId)?.name ?? "unknown" });
        return;
    }

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

    createTradeMessage(
        enacted,
        {
            message: "PF2E.loot.SellMessage",
            subtitle: "PF2E.loot.SellSubtitle",
        },
        senderId
    );

    return newItem;
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

    const price = calculateItemPrice(item, quantity, defaultFilter.ratio);
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

    const { checkboxes, multiselects, ranges, sliders } = filter;

    // Level
    const itemLevel = item.level;
    if (
        sliders?.level &&
        (itemLevel < sliders.level.values.min || itemLevel > sliders.level.values.max)
    ) {
        return false;
    }

    // Price
    const priceInCopper = item.price.value.copperValue;
    if (
        ranges?.price &&
        (priceInCopper < ranges.price.values.min || priceInCopper > ranges.price.values.max)
    ) {
        return false;
    }

    // Item type
    const itemTypes = checkboxes?.itemTypes?.selected;
    if (itemTypes && itemTypes.length > 0 && !itemTypes.includes(item.type)) {
        return false;
    }

    const itemCategory = "category" in item ? (item.category as string) : "";
    const itemGroup = "group" in item ? (item.group as string) : "";

    // Armor
    const armorTypes = checkboxes?.armorTypes?.selected;
    if (
        armorTypes &&
        armorTypes.length > 0 &&
        !arrayIncludes(armorTypes, [itemCategory, itemGroup])
    ) {
        return false;
    }

    // Weapon categories
    const weaponTypes = checkboxes?.weaponTypes?.selected;
    if (
        weaponTypes &&
        weaponTypes.length > 0 &&
        !arrayIncludes(weaponTypes, [itemCategory, itemGroup])
    ) {
        return false;
    }

    // Traits
    const traits = multiselects?.traits;
    if (traits && !filterTraits([...item.traits], traits.selected, traits.conjunction)) {
        return false;
    }

    // Source
    const itemSource = game.pf2e.system.sluggify(item.system.publication?.title ?? "").trim();
    const sources = checkboxes?.source?.selected;
    if (sources && sources.length > 0 && !sources.includes(itemSource)) {
        return false;
    }

    // Rarity
    const rarities = checkboxes?.rarity?.selected;
    if (rarities && rarities.length > 0 && !rarities.includes(item.rarity)) {
        return false;
    }

    return true;
}

async function browserClose(
    this: CompendiumBrowser,
    wrapped: libWrapper.RegisterCallback,
    options: any
) {
    deleteInMemory(this);
    wrapped(options);
}

async function browserRenderInner(
    this: CompendiumBrowser,
    wrapped: libWrapper.RegisterCallback,
    sheetData: CompendiumBrowserSheetData
) {
    const $html = await wrapped(sheetData);

    const data = getInMemory<BrowserData>(this);
    if (!data?.actor.isMerchant) return $html;

    const html = $html[0];
    const listButtons = htmlQuery(html, "section.content .tab[data-tab='equipment'] .list-buttons");
    if (!listButtons) return $html;

    html.classList.add("toolbelt-merchant");

    for (const button of listButtons.querySelectorAll("button")) {
        button.remove();
    }

    if (data.type === "pull") {
        const pullElements = createHTMLElement("div", {
            innerHTML: await render("browserPull", {}),
        });

        listButtons.append(...pullElements.children);

        const oweditems = R.pipe(
            data.actor.inventory.contents,
            R.map((item) => item.sourceId),
            R.filter(R.isTruthy)
        );

        deleteInMemory(this, "selection");
        setInMemory(this, "owned", oweditems);
    } else {
        const typeLabel = localize("filter", data.filterType);
        const label = localize("browserFilter", data.edit ? "edit" : "create", { type: typeLabel });

        const button = createHTMLElement("button", {
            innerHTML: label,
            dataset: {
                action: "validate-filter",
            },
        });

        listButtons.append(button);
    }

    return $html;
}

function fillSelection(tab: CompendiumBrowserEquipmentTab, selection: string[], owned?: string[]) {
    owned ??= getInMemory<string[]>(tab.browser, "owned") ?? [];
    selection.length = 0;

    for (const { uuid } of tab.currentIndex) {
        if (owned.includes(uuid)) continue;
        selection.push(uuid);
        if (selection.length >= PULL_LIMIT) break;
    }

    return selection;
}

async function browserEquipmentTabRenderResults(
    this: CompendiumBrowserEquipmentTab,
    wrapped: libWrapper.RegisterCallback,
    start: number
): Promise<HTMLLIElement[]> {
    const browser = this.browser;
    const itemElements = (await wrapped(start)) as HTMLLIElement[];
    const data = getInMemory<BrowserData>(browser);
    if (!data || !data.actor.isMerchant) return itemElements;

    for (const itemElement of itemElements) {
        for (const a of itemElement.querySelectorAll(":scope > a")) {
            a.remove();
        }
    }

    if (data.type !== "pull") return itemElements;

    const selection = getInMemoryAndSetIfNot(browser, "selection", () => {
        const selection = fillSelection(this, [], data.owned);
        updateBrowser(selection);
        return selection;
    });

    const isAtLimit =
        selection.length >= PULL_LIMIT
            ? `data-tooltip="${localize("browserPull.limit")}" disabled`
            : "";

    const ownedStr = localize("browserPull.owned");
    const isOwned = `<i class="fa-solid fa-box" data-tooltip="${ownedStr}"></i>`;

    for (const itemElement of itemElements) {
        const { entryUuid } = elementDataset(itemElement);

        if (data.owned.includes(entryUuid)) {
            itemElement.insertAdjacentHTML("beforeend", isOwned);
            continue;
        }

        const checked = selection.includes(entryUuid) ? "checked" : "";
        itemElement.insertAdjacentHTML(
            "beforeend",
            `<input type='checkbox' data-uuid="${entryUuid}" 
			${checked} ${!checked ? isAtLimit : ""}>`
        );

        const checkbox = itemElement.querySelector("input");
        checkbox?.addEventListener("change", () => {
            if (checkbox.checked) {
                selection.push(entryUuid);
            } else {
                const index = selection.indexOf(entryUuid);
                selection.splice(index, 1);
            }
            updateBrowser(selection);
        });
    }

    return itemElements;
}

function updateBrowser(selection: string[], skipAll = false) {
    const browserApp = document.getElementById("compendium-browser");
    const browserTab = browserApp?.querySelector(
        ".content-box.toolbelt-merchant .content .tab[data-tab=equipment]"
    );
    if (!browserTab) return;

    const listButtons = htmlQuery(browserTab, ".list-buttons");
    if (!listButtons) return;

    const tab = game.pf2e.compendiumBrowser.tabs.equipment;
    const selected = selection.length;
    const total = tab.currentIndex.length;
    const isAtLimit = selected >= PULL_LIMIT;
    const reachedLimit = localize("browserPull.limit");
    const numbers = listButtons.querySelectorAll(":scope > div span");
    const checkboxes = browserTab.querySelectorAll<HTMLInputElement>(".result-list .item input");

    if (numbers.length) {
        numbers[0].textContent = String(selected);
        numbers[1].textContent = String(total);
    }

    if (!skipAll) {
        const checkbox = listButtons.querySelector<HTMLInputElement>(":scope > label input");
        if (checkbox) {
            if (selected === 0) {
                checkbox.indeterminate = false;
                checkbox.checked = false;
            } else if (isAtLimit || selected >= total) {
                checkbox.indeterminate = false;
                checkbox.checked = true;
            } else {
                checkbox.indeterminate = true;
                checkbox.checked = true;
            }
        }
    }

    htmlQuery<HTMLButtonElement>(listButtons, "button")!.disabled = selected === 0;

    for (const checkbox of checkboxes) {
        const checked = checkbox.checked;
        const disabled = !checked && isAtLimit;

        checkbox.disabled = disabled;
        checkbox.dataset.tooltip = disabled ? reachedLimit : "";
    }
}

function browserActivateListeners(
    this: CompendiumBrowser,
    wrapped: libWrapper.RegisterCallback,
    $html: JQuery
) {
    wrapped($html);

    const data = getInMemory<BrowserData>(this);
    if (!data?.actor?.isMerchant) return;

    const html = $html[0];
    const tabEl = htmlQuery(html, "section.content .tab[data-tab='equipment']");
    const listButtons = htmlQuery(tabEl, ".list-buttons");
    if (!listButtons) return;

    const actor = data.actor;
    const browser = this;
    const tab = browser.tabs.equipment;

    if (data.type === "pull") {
        addListener(listButtons, "[data-action='add-to-merchant']", async () => {
            const selection = getInMemory<string[]>(browser, "selection") ?? [];
            const message = localize("browserPull.confirm", { nb: selection.length });
            const confirm = await Dialog.confirm({
                title: `${localize("sheet.browser")} - ${actor.name}`,
                content: `<div style="margin-bottom: 0.5em;">${message}</div>`,
            });
            if (!confirm) return;

            localize.info("browserPull.wait");
            browser.close();

            const items = R.pipe(
                await Promise.all(selection.map((uuid) => fromUuid<PhysicalItemPF2e>(uuid))),
                R.filter(R.isTruthy),
                R.map((item) => item.toObject())
            );

            if (items.length) {
                await actor.createEmbeddedDocuments("Item", items);
            }

            localize.info("browserPull.finished");
        });

        addListener(
            listButtons,
            "[data-action='toggle-select-all']",
            (event, el: HTMLInputElement) => {
                const checkAll = el.checked;
                const selection = getInMemory<string[]>(browser, "selection") ?? [];

                if (checkAll) {
                    fillSelection(tab, selection);
                } else {
                    selection.length = 0;
                }

                const checkboxes = tabEl!.querySelectorAll<HTMLInputElement>(".item input");
                for (const checkbox of checkboxes) {
                    const { uuid } = elementDataset(checkbox);
                    checkbox.checked = selection.includes(uuid);
                }

                updateBrowser(selection, false);
            }
        );
    } else {
        addListener(listButtons, "[data-action='validate-filter']", async () => {
            const filterData = tab.filterData;
            const defaultData = await tab.getFilterData();
            const extractedData: Partial<EquipmentFilters> = {};
            const search = filterData.search.text.trim();

            if (search) {
                foundry.utils.setProperty(extractedData, "search.text", search);
            }

            for (const type of ["checkboxes", "multiselects"] as const) {
                for (const [category, data] of Object.entries(filterData[type])) {
                    if (!data.selected.length) continue;

                    const path = `${type}.${category}`;

                    foundry.utils.setProperty(extractedData, `${path}.selected`, data.selected);

                    if ("conjunction" in data) {
                        foundry.utils.setProperty(
                            extractedData,
                            `${path}.conjunction`,
                            data.conjunction
                        );
                    }
                }
            }

            for (const type of ["ranges", "sliders"] as const) {
                const defaultType = defaultData[type];

                for (const [category, data] of Object.entries(filterData[type])) {
                    // @ts-ignore
                    const defaultCategory = defaultType[category];
                    if (foundry.utils.objectsEqual(data.values, defaultCategory.values)) continue;

                    foundry.utils.setProperty(
                        extractedData,
                        `${type}.${category}.values`,
                        data.values
                    );
                }
            }

            if (foundry.utils.isEmpty(extractedData)) {
                localize.warn("browserFilter.empty");
                return;
            }

            browser.close();

            const filters = getFilters(actor, data.filterType, false) as ItemFilterBase[];

            if (data.edit) {
                const itemFilter = filters.find((x) => x.id === data.edit);

                if (itemFilter) {
                    itemFilter.filter = extractedData;
                    setFilters(actor, data.filterType, filters);
                    return;
                }
            }

            const id = foundry.utils.randomID();
            const itemFilter: ItemFilter = {
                id,
                name: id,
                enabled: true,
                filter: extractedData,
                useDefault: true,
            };

            filters.unshift(itemFilter);
            setFilters(actor, data.filterType, filters);
        });
    }
}

async function lootSheetPF2eRenderInner(
    this: LootSheetPF2e,
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
    this: LootSheetPF2e,
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
                return openEquipmentTab({ actor, type: "pull", owned: [] });
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
                    await sellService({ actor }, serviceId, {
                        forceFree: action === "give-service",
                    });
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

async function sellService(
    seller: TraderData,
    serviceId: string,
    { buyer, forceFree = false }: { buyer?: TraderData; forceFree?: boolean } = {}
) {
    if (!seller.actor?.isOfType("loot") || (buyer?.actor && !isValidServiceBuyer(buyer.actor)))
        return;

    if (!hasGMOnline()) {
        return error("tool.noGM");
    }

    const service = getService(seller.actor, serviceId);
    if (!service?.enabled) return;

    if (!buyer) {
        const selected = R.only(canvas.tokens.controlled);

        if (isValidServiceBuyer(selected?.actor)) {
            buyer = { actor: selected.actor, token: selected };
        } else {
            const character = game.user.character;

            if (isValidServiceBuyer(character)) {
                buyer = { actor: character };
            }
        }

        if (!buyer) {
            return localize.warn("service.noBuyer");
        }
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

    const msgTrader = forceFree ? seller : buyer;
    const msgOptions: ServiceMsgOptions = {
        token: msgTrader.token,
        tradeMsg: localize("service", forceFree ? "give" : "buy", notifyData),
        flags: {
            buyerUUID: buyer.actor.uuid,
            sellerUUID: seller.actor.uuid,
            serviceId: service.id,
            forceFree,
        },
    };

    return serviceMessage(msgTrader.actor, service, seller.actor, msgOptions);
}

function serviceCanBePurchased(service: ServiceFlag): service is ServiceFlag {
    return !!service.enabled && (service.quantity ?? -1) !== 0;
}

async function serviceMessage(
    actor: ActorPF2e,
    service: ServiceFlag,
    seller: LootPF2e,
    { token, tradeMsg, flags }: ServiceMsgOptions = {}
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
        style: CONST.CHAT_MESSAGE_STYLES.OTHER,
        content,
        speaker: ChatMessagePF2e.getSpeaker({
            actor: actor,
            token,
        }),
    };

    if (flags) {
        setFlagProperty(msgData, "service", flags);
    }

    return ChatMessagePF2e.create(msgData);
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

    static DEFAULT_OPTIONS: PartialApplicationConfiguration = {
        tag: "form",
        position: {
            width: 600,
        },
        form: {
            handler: ServiceMenu.myFormHandler,
            submitOnChange: true,
            closeOnSubmit: false,
        },
        classes: ["pf2e-hud-service"],
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

    constructor(actor: LootPF2e, serviceId: string, options: PartialApplicationConfiguration = {}) {
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
        RATIO.services.max
    );
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

class FiltersMenu extends Application {
    actor: LootPF2e;

    constructor(actor: LootPF2e) {
        super();

        this.actor = actor;
    }

    get id() {
        return localize("filters.app");
    }

    get title() {
        return localize("filters.title", this.actor);
    }

    get template() {
        return templatePath("filters");
    }

    render(force?: boolean, options?: RenderOptions): this {
        this.actor.apps[this.appId] = this;
        return super.render(force, options);
    }

    async close(options?: { force?: boolean }) {
        await super.close(options);
        delete this.actor.apps[this.appId];
    }

    getData() {
        const actor = this.actor;
        const translate = localize.sub("filters");
        const buyFilters = getFilters(actor, "buy", true);
        const sellFilters = getFilters(actor, "sell", true);

        const templateFilter = (filters: ExtractedFilter[]) => {
            const limit = filters.length - 1;
            return (filter: ExtractedFilter, index: number) => ({
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
            i18n: translate.i18n,
            buyFilters: buyFilters.map(templateFilter(buyFilters)),
            sellFilters: sellFilters.map(templateFilter(sellFilters)),
            ratios: RATIO,
        };
    }

    activateListeners($html: JQuery<HTMLElement>) {
        const html = $html[0];
        const browser = game.pf2e.compendiumBrowser;
        const tab = browser.tabs.equipment;

        addListenerAll(html, "[data-action='add-filter']", (even, el) => {
            const { type } = elementDataset<{ type: ItemFilterType }>(el);
            openEquipmentTab({
                actor: this.actor,
                type: "filter",
                filterType: type,
                edit: false,
            });
        });

        const getItemData = (el: HTMLElement) => {
            const data = elementDataset<{ id: string; type: ItemFilterType }>(
                htmlClosest(el, "[data-id]")!
            );
            const { type, id } = data;

            const itemFilters = getFilters(this.actor, type, true);
            const filterIndex = itemFilters.findIndex((x) => x.id === id);

            return {
                ...data,
                itemFilters,
                filterIndex,
            };
        };

        addListenerAll(html, "input", "change", (event, el: HTMLInputElement) => {
            const { itemFilters, filterIndex, type } = getItemData(el);
            const filter = itemFilters.at(filterIndex);
            if (!filter) return;

            const key = el.name;
            const value =
                el.type === "checkbox"
                    ? el.checked
                    : el.type === "number"
                    ? el.valueAsNumber
                    : el.value.trim();

            foundry.utils.setProperty(filter, key, value);
            setFilters(this.actor, type, itemFilters);
        });

        addListenerAll(html, "input[type='text'], input[type='number']", "keydown", (event, el) => {
            if (event.key === "Enter") {
                el.blur();
            }
        });

        addListenerAll(html, "[data-action='move-filter']", (event, el) => {
            const { itemFilters, filterIndex, type } = getItemData(el);
            const { direction } = elementDataset<{ direction: "up" | "down" }>(el);
            const newIndex = direction === "up" ? filterIndex - 1 : filterIndex + 1;

            if (newIndex < 0 || newIndex >= itemFilters.length) return;

            const newFilters = R.swapIndices(itemFilters, filterIndex, newIndex);
            setFilters(this.actor, type, newFilters);
        });

        addListenerAll(html, "[data-action='delete-filter']", async (event, el) => {
            const { type, filterIndex, itemFilters } = getItemData(el);
            if (filterIndex === -1) return;

            const filter = itemFilters.at(filterIndex);
            const confirm = await Dialog.confirm({
                title: localize("filters.delete.title"),
                content: localize("filters.delete.content", { name: filter!.name || filter!.id }),
            });

            if (confirm) {
                itemFilters.splice(filterIndex, 1);
                setFilters(this.actor, type, itemFilters);
            }
        });

        addListenerAll(html, "[data-action='edit-filter']", async (event, el) => {
            const { type, id, filterIndex, itemFilters } = getItemData(el);
            const defaultData = await tab.getFilterData();
            const itemFilter = itemFilters.at(filterIndex)?.filter;
            if (!itemFilter) return;

            const filter = foundry.utils.mergeObject(defaultData, itemFilter);

            if (itemFilter.ranges) {
                for (const key in itemFilter.ranges) {
                    const range = filter.ranges[key as keyof EquipmentFilters["ranges"]];
                    range.isExpanded = true;
                }
            }

            if (itemFilter.sliders) {
                for (const key in itemFilter.sliders) {
                    const slider = filter.sliders[key as keyof EquipmentFilters["sliders"]];
                    slider.isExpanded = true;
                }
            }

            if (itemFilter.checkboxes) {
                for (const key in itemFilter.checkboxes) {
                    const checkbox = filter.checkboxes[key as keyof EquipmentFilters["checkboxes"]];

                    checkbox.isExpanded = true;
                    for (const selected of checkbox.selected) {
                        checkbox.options[selected].selected = true;
                    }
                }
            }

            openEquipmentTab(
                {
                    actor: this.actor,
                    type: "filter",
                    filterType: type,
                    edit: id,
                },
                filter
            );
        });
    }
}

async function openEquipmentTab(data: BrowserData, filters?: EquipmentFilters) {
    const browser = game.pf2e.compendiumBrowser;
    const tab = browser.tabs.equipment;

    deleteInMemory(browser);
    setInMemory(browser, data);
    tab.open(filters ?? (await tab.getFilterData()));
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
    return Math.clamp(value, RATIO[type].min, RATIO[type].max).toNearest(0.1, "floor");
}

type ServiceEventAction = "open-macros" | "edit-image" | "open-macro-sheet" | "delete-macro";

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

type PacketData = TradeData & {
    priceData: Coins;
    filterId: string;
};

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

type TraderData = {
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

type ServiceMsgFlag = {
    buyerUUID: string;
    sellerUUID: string;
    serviceId: string;
    forceFree: boolean;
};

type ServiceMsgOptions = {
    token?: TokenPF2e | TokenDocumentPF2e | null;
    tradeMsg?: string;
    flags?: ServiceMsgFlag;
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

type BrowserData =
    | {
          type: "pull";
          actor: LootPF2e;
          owned: string[];
      }
    | {
          type: "filter";
          actor: LootPF2e;
          filterType: ItemFilterType;
          edit: string | false;
      };

export { config as betterMerchantTool };
