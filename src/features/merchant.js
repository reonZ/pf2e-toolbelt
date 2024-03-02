import {
	ErrorPF2e,
	calculateItemPrice,
	createFancyLink,
	createTradeMessage,
	deleteInMemory,
	flagPath,
	getBrowser,
	getBrowserTab,
	getFlag,
	getHighestName,
	getInMemory,
	getInMemoryAndSetIfNot,
	getSetting,
	includesBrowserUUID,
	openBrowserTab,
	registerWrapper,
	render,
	setFlag,
	setInMemory,
	subLocalize,
	transferItemToActor,
} from "module-api";
import { BuyItems } from "../apps/merchant/buy";
import { wrapperError } from "../misc";
import { createTool } from "../tool";

const localize = subLocalize("merchant");

const ITEM_PREPARE_DERIVED_DATA =
	"CONFIG.Item.documentClass.prototype.prepareDerivedData";
const LOOT_TRANSFER_ITEM_TO_ACTOR =
	"CONFIG.PF2E.Actor.documentClasses.loot.prototype.transferItemToActor";
const ACTOR_TRANSFER_ITEM_TO_ACTOR =
	"CONFIG.Actor.documentClass.prototype.transferItemToActor";
const BROWSER_CLOSE = "game.pf2e.compendiumBrowser.constructor.prototype.close";
const BROWSER_INNER_RENDER =
	"game.pf2e.compendiumBrowser.constructor.prototype._renderInner";
const BROWSER_ACTIVE_LISTENERS =
	"game.pf2e.compendiumBrowser.constructor.prototype.activateListeners";
const BROWSER_RENDER_RESULTS =
	"game.pf2e.compendiumBrowser.tabs.equipment.constructor.prototype.renderResults";

const PULL_LIMIT = 100;

export const PRICE_RATIO = {
	min: 0.1,
	max: 5,
	step: 0.1,
	buy: 0.5,
	sell: 1,
};

export const merchantOptions = {
	name: "merchant",
	settings: [
		{
			key: "merchant",
			type: Boolean,
			default: false,
			requiresReload: true,
		},
	],
	socket: onSocket,
	init: (isGM) => {
		if (!getSetting("merchant")) return;

		if (isGM) {
			socket.activate();
			Hooks.on("renderLootSheetPF2e", renderLootSheetPF2e);
		}

		registerWrapper(
			ITEM_PREPARE_DERIVED_DATA,
			itemPrepareDerivedData,
			"WRAPPER",
		);
		registerWrapper(
			LOOT_TRANSFER_ITEM_TO_ACTOR,
			lootTranferItemToActor,
			"OVERRIDE",
		);
		registerWrapper(
			ACTOR_TRANSFER_ITEM_TO_ACTOR,
			actorTranferItemToActor,
			"MIXED",
		);
	},
	ready: (isGM) => {
		if (!isGM || !getSetting("merchant")) return;
		registerWrapper(BROWSER_CLOSE, browserClose);
		registerWrapper(BROWSER_INNER_RENDER, browserInnerRender);
		registerWrapper(BROWSER_RENDER_RESULTS, browserRenderResults);
		registerWrapper(BROWSER_ACTIVE_LISTENERS, browserActiveListeners);
	},
};

const { socket } = createTool(merchantOptions);

function onSocket(packet, userId) {
	switch (packet.type) {
		case "buy-deal":
			makeBuyDeal(packet, userId);
			break;
	}
}

async function browserClose(wrapped, options) {
	deleteInMemory(this, "merchant");
	await wrapped(options);
}

async function browserInnerRender(wrapped, data) {
	const inner = await wrapped(data);
	const actor = getInMemory(this, "merchant.actor");
	if (!actor) return inner;

	deleteInMemory(this, "merchant.selection");

	setInMemory(
		this,
		"merchant.owned",
		actor.inventory.map((x) => x.sourceId),
	);

	inner.addClass("toolbelt-merchant");

	const tabElement = inner.find(".content .tab[data-tab=equipment]");

	tabElement.find(".control-area").prepend(`<h2>${actor.name}</h2>`);

	const footer = tabElement.find(".list-buttons");
	footer.find("button").remove();

	const selected = localize("browser.selected");
	footer.append(`<div>${selected}: <span>0</span>/<span>0</span></div>`);

	const btn = localize("browser.add");
	footer.append(`<button type='button'>${btn}</button>`);

	const all = localize("browser.all");
	footer.append(`<label>${all} <input type='checkbox'></button></label>`);

	return inner;
}

function updateBrowser(selection, skipAll = false) {
	const browserApp = document.getElementById("compendium-browser");
	if (!browserApp) return;

	const browserTab = browserApp.querySelector(
		".content-box.toolbelt-merchant .content .tab[data-tab=equipment]",
	);
	const footer = browserTab.querySelector(".list-buttons");

	const tab = getBrowserTab("equipment");
	const selected = selection.length;
	const total = tab.currentIndex.length;

	const numbers = footer.querySelectorAll(":scope > div span");
	if (numbers.length) {
		numbers[0].textContent = selected;
		numbers[1].textContent = total;
	}

	const isAtLimit = selected >= PULL_LIMIT;

	if (!skipAll) {
		const checkbox = footer.querySelector(":scope > label input");
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

	footer.querySelector("button").disabled = selected === 0;

	const reachedLimit = localize("browser.limit");
	const checkboxes = browserTab.querySelectorAll(".result-list .item input");
	for (const checkbox of checkboxes) {
		const checked = checkbox.checked;
		const disabled = !checked && isAtLimit;

		checkbox.disabled = disabled;
		checkbox.dataset.tooltip = disabled ? reachedLimit : "";
	}
}

function fillSelection(
	tab,
	selection,
	owned = getInMemory(tab.browser, "merchant.owned"),
) {
	selection.length = 0;
	for (const { uuid } of tab.currentIndex) {
		if (includesBrowserUUID(owned, uuid)) continue;
		selection.push(uuid);
		if (selection.length >= PULL_LIMIT) break;
	}
	return selection;
}

function browserActiveListeners(wrapped, inner) {
	wrapped(inner);

	// biome-ignore lint/complexity/noUselessThisAlias: <explanation>
	const browser = this;
	const actor = getInMemory(browser, "merchant.actor");
	if (!actor) return;

	const browserTab = inner[0].querySelector(
		".content .tab[data-tab=equipment]",
	);
	const footer = browserTab.querySelector(".list-buttons");

	const checkbox = footer.querySelector("label input[type=checkbox]");
	if (checkbox) {
		const tab = getBrowserTab("equipment");

		checkbox.addEventListener("change", () => {
			const checkAll = checkbox.checked;
			const selection = getInMemory(tab.browser, "merchant.selection");

			if (checkAll) fillSelection(tab, selection);
			else selection.length = 0;

			const checkboxes = browserTab.querySelectorAll(".item input");
			for (const checkbox of checkboxes) {
				const uuid = checkbox.dataset.uuid;
				checkbox.checked = selection.includes(uuid);
			}

			updateBrowser(selection, false);
		});
	}

	const btn = footer.querySelector("button");
	if (btn) {
		btn.addEventListener("click", () => {
			const selection = getInMemory(browser, "merchant.selection");
			const msg = localize("browser.dialogMsg", { nb: selection.length });

			Dialog.confirm({
				content: `<div style="margin-bottom: 0.5em;">${msg}</div>`,
				title: `${localize("browser.pull")} - ${actor.name}`,
				yes: async (html) => {
					localize.info("browser.wait");

					const items = await Promise.all(
						selection.map((uuid) => fromUuid(uuid)),
					);

					await actor.createEmbeddedDocuments(
						"Item",
						items.map((item) => item.toObject()),
					);

					localize.info("browser.finished");
				},
			});
		});
	}
}

async function browserRenderResults(wrapped, start) {
	const items = await wrapped(start);
	const owned = getInMemory(this.browser, "merchant.owned");
	if (!owned) return items;

	const browser = this.browser;

	const selection = getInMemoryAndSetIfNot(
		browser,
		"merchant.selection",
		() => {
			const selection = fillSelection(this, [], owned);
			updateBrowser(selection);
			return selection;
		},
	);

	const isAtLimit =
		selection.length >= PULL_LIMIT
			? `data-tooltip="${localize("browser.limit")}" disabled`
			: "";

	const ownedStr = localize("browser.owned");
	const isOwned = `<i class="fa-solid fa-box" data-tooltip="${ownedStr}"></i>`;

	for (const item of items) {
		for (const a of item.querySelectorAll(":scope > a")) {
			a.remove();
		}

		const uuid = item.dataset.entryUuid;

		if (includesBrowserUUID(owned, uuid)) {
			item.insertAdjacentHTML("beforeend", isOwned);
			continue;
		}

		const checked = selection.includes(uuid) ? "checked" : "";
		item.insertAdjacentHTML(
			"beforeend",
			`<input type='checkbox' data-uuid="${uuid}" 
			${checked} ${!checked ? isAtLimit : ""}>`,
		);

		const checkbox = item.querySelector("input");
		checkbox.addEventListener("change", () => {
			if (checkbox.checked) {
				selection.push(uuid);
			} else {
				const index = selection.indexOf(uuid);
				selection.splice(index, 1);
			}
			updateBrowser(selection);
		});
	}

	return items;
}

async function renderLootSheetPF2e(sheet, html) {
	const actor = sheet.actor;
	if (!actor?.isMerchant) return;

	const {
		noCoins = false,
		buyItems = false,
		priceRatio = 1,
		infiniteStocks = false,
		infiniteItems = {},
	} = getFlag(actor, "merchant") ?? {};

	const sheetTemplate = await render("merchant/sheet", {
		noCoins,
		buyItems,
		infiniteStocks,
		priceRatio: {
			...PRICE_RATIO,
			value: clampPriceRatio("sell", priceRatio),
		},
		actorUUID: actor.uuid,
		...localize.i18n,
		flagPath: (str) => flagPath("merchant", str),
	});

	const sidebar = html.find(".sheet-sidebar");

	sidebar.find(".editor").before(sheetTemplate);

	const better = sidebar.find(".better-merchant");
	better
		.find("[data-action=open-equipment-tab]")
		.on("click", (event) => openEquipmentTab(actor));
	better
		.find("[data-action=open-buy-settings]")
		.on("click", (event) => openBuySettings(event, actor));

	const itemTypes = html
		.find(".content .sheet-body [data-item-types]")
		.filter("[data-item-types!=treasure]");

	let hasInfiniteStock = infiniteStocks;

	if (infiniteStocks) {
		itemTypes.find(".quantity a").remove();
	} else {
		const items = itemTypes.find("[data-item-id]");
		const tooltip = localize.path("infinite-item.tooltip");

		for (const item of items) {
			const itemId = item.dataset.itemId;
			const isInfinite = !!infiniteItems[itemId];

			const toggle =
				$(`<a data-action="toggle-infinite-item" data-tooltip="${tooltip}">
	<i class="${isInfinite ? "fa-solid" : "fa-duotone"} fa-infinity"></i>
</a>`)[0];

			item.querySelector(".item-controls").prepend(toggle);

			if (isInfinite) {
				for (const el of item.querySelectorAll(".quantity a")) {
					el.remove();
				}
			}

			toggle.addEventListener("click", (event) => {
				const flagKey = `merchant.infiniteItems.${itemId}`;
				const current = getFlag(actor, flagKey) ?? false;
				setFlag(actor, flagKey, !current);
			});

			if (isInfinite) {
				hasInfiniteStock = true;
			}
		}
	}

	if (hasInfiniteStock) {
		html.find(".content .sheet-body .coinage .wealth h3:last span").html("-");

		html.find(".content .sheet-body .total-bulk span").html(
			game.i18n.format("PF2E.Actor.Inventory.TotalBulk", {
				bulk: "-",
			}),
		);
	}
}

function itemPrepareDerivedData(wrapped) {
	wrapped();

	try {
		if (!this.isOfType("physical") || this.isOfType("treasure")) return;

		const actor = this.actor;
		if (!actor?.isMerchant) return;

		const actorFlags = getFlag(actor, "merchant");
		if (!actorFlags) return;

		const { priceRatio, infiniteStocks, infiniteItems = {} } = actorFlags;

		if (priceRatio !== 1) {
			const ratio = clampPriceRatio("sell", priceRatio);
			this.system.price.value = this.system.price.value.scale(ratio);
		}

		const isInfinite = (() => {
			if (typeof infiniteStocks === "boolean" && infiniteStocks) {
				return true;
			}
			const infiniteItem = infiniteItems[this.id];
			return typeof infiniteItem === "boolean" && infiniteItem;
		})();

		if (isInfinite) {
			this.system.quantity = 9999;
		}
	} catch (error) {
		wrapperError("merchant", ITEM_PREPARE_DERIVED_DATA);
	}
}

async function lootTranferItemToActor(...args) {
	const [targetActor, item, quantity] = args;
	const thisSuper = Actor.implementation.prototype;

	if (!(this.isOwner && targetActor.isOwner)) {
		return thisSuper.transferItemToActor.apply(this, args);
	}
	if (this.isMerchant && item.isOfType("physical")) {
		const itemValue = game.pf2e.Coins.fromPrice(item.price, quantity);
		if (await targetActor.inventory.removeCoins(itemValue)) {
			if (!getFlag(this, "merchant.noCoins")) {
				await item.actor.inventory.addCoins(itemValue);
			}
			return thisSuper.transferItemToActor.apply(this, args);
		}
		if (this.isLoot) {
			throw ErrorPF2e("Loot transfer failed");
		}
		return null;
	}

	return thisSuper.transferItemToActor.apply(this, args);
}

function getFilters(actor) {
	return getFlag(actor, "merchant.filters")?.slice() ?? [];
}

export function getBuyAll(actor) {
	return getFlag(actor, "merchant.buyAll") ?? true;
}

function createPurse(filter, itemPrice) {
	const isDefault = filter instanceof Actor;
	const purse = clampPurse(
		isDefault ? getFlag(filter, "merchant.buyPurse") : filter.purse,
	);
	const ratio = clampPriceRatio(
		"buy",
		isDefault ? getFlag(filter, "merchant.buyRatio") : filter.priceRatio,
	);
	const price = itemPrice.scale(ratio);
	const isInfinite = purse < 0;
	const goldValue = price.goldValue;

	return {
		price,
		ratio,
		purse,
		goldValue,
		isInfinite,
		canAfford: isInfinite || purse >= goldValue,
	};
}

async function actorTranferItemToActor(wrapped, ...args) {
	const [buyer, item, quantity = 1, containerId, newStack] = args;
	if (
		!buyer.isOfType("loot") ||
		!buyer.isMerchant ||
		!getFlag(buyer, "merchant.buyItems")
	) {
		return wrapped(...args);
	}

	const hasPlayerOwner = this.hasPlayerOwner;

	switch (this.type) {
		case "character":
		case "party":
			break;
		case "loot":
			if (!hasPlayerOwner || this.isMerchant) {
				return wrapped(...args);
			}
			break;
		case "npc":
			if (!hasPlayerOwner) {
				return wrapped(...args);
			}
			break;
		default:
			return wrapped(...args);
	}

	const targetName = buyer.name;
	const itemQuantity = Math.min(quantity, item.quantity);
	const itemPrice = calculateItemPrice(item, itemQuantity);

	const totalPurse = createPurse(buyer, itemPrice);
	if (!totalPurse.canAfford) {
		localize.info("buy.poor.total", { actor: targetName });
		return;
	}

	let poor = false;
	let selected = null;
	const filters = getFilters(buyer);

	for (const filter of filters) {
		if (BuyItems.compareItemWithFilter(item, filter)) {
			const purse = createPurse(filter, itemPrice);
			if (!purse.canAfford) {
				poor = true;
				continue;
			}
			selected = filter.id;
			break;
		}
	}

	if (!selected && !getBuyAll(buyer)) {
		localize.info(poor ? "buy.poor.filter" : "buy.refuse", {
			actor: targetName,
		});
		return;
	}

	makeBuyDeal({
		buyer,
		seller: this,
		item,
		quantity,
		containerId,
		newStack,
		filter: selected,
	});
}

async function makeBuyDeal(options, senderId) {
	const getDocument = async (option, Class) => {
		return option instanceof Class ? option : await fromUuid(option);
	};

	const errorMsg = (err) => {
		localize.error(
			"An error occured while making a deal (F12 for more details in the console).",
		);
		throw new Error(err);
	};

	const buyer = await getDocument(options.buyer, Actor);
	const seller = await getDocument(options.seller, Actor);
	const item = await getDocument(options.item, Item);

	if (!buyer || !seller || !item) {
		const docs = ["buyer", "seller", "item"]
			.map((x) => `${x}: ${options[x].uuid ?? options[x]}`)
			.join(", ");
		errorMsg(
			`Missing actors or item to finish processing the buy deal, ${docs}.`,
		);
	}

	if (!buyer.isOwner || !seller.isOwner) {
		socket.emit({
			...options,
			type: "buy-deal",
			buyer: buyer.uuid,
			seller: seller.uuid,
			item: item.uuid,
		});
		return;
	}

	// get item data
	const itemQuantity = Math.min(options.quantity, item.quantity);
	const itemPrice = calculateItemPrice(item, itemQuantity);

	// get purse data
	const filters = getFilters(buyer);
	const filter = filters.find((f) => f.id === options.filter);
	const totalPurse = createPurse(buyer, itemPrice);
	const filterPurse = filter ? createPurse(filter, itemPrice) : undefined;

	const purseError = (type, purse) => {
		errorMsg(
			`${buyer.uuid} can't buy ${itemQuantity} x ${item.uuid}, the ${type} gold purse doesn't have enough founds, need: ${goldPrice}, has: ${purse}.`,
		);
	};

	if (!totalPurse.canAfford) {
		purseError("total", totalPurse);
	}
	if (filterPurse && !filterPurse.canAfford) {
		purseError("filter", filter.purse);
	}

	const selectedPurse = filterPurse ?? totalPurse;
	const purseUpdates = {};

	if (!totalPurse.isInfinite) {
		purseUpdates[flagPath("merchant.buyPurse")] =
			totalPurse.purse - selectedPurse.goldValue;
	}
	if (filterPurse && !filterPurse.isInfinite) {
		filter.purse = filterPurse.purse - selectedPurse.goldValue;
		purseUpdates[flagPath("merchant.filters")] = filters;
	}
	if (!isEmpty(purseUpdates)) {
		await buyer.update(purseUpdates);
	}

	await seller.inventory.addCoins(selectedPurse.price);

	const newItem = await transferItemToActor(buyer, item, itemQuantity);

	const message = localize("sold.message", {
		buyer: getHighestName(buyer),
		quantity: itemQuantity,
		item: await createFancyLink(newItem),
		seller: getHighestName(seller),
		price: parseFloat(selectedPurse.goldValue.toFixed(2)),
	});

	await createTradeMessage(
		localize("sold.subtitle"),
		message,
		buyer,
		newItem,
		senderId,
	);
}

function openEquipmentTab(actor) {
	const browser = getBrowser();
	setInMemory(browser, "merchant", { actor });
	openBrowserTab("equipment", false);
}

function openBuySettings(event, actor) {
	new BuyItems(actor).render(true);
}

/**
 * @param {"buy"|"sell"} type
 * @param {unknown} value
 * @returns {number}
 */
export function clampPriceRatio(type, value) {
	if (!Number.isNumeric(value)) return PRICE_RATIO[type];
	return Math.clamped(value, PRICE_RATIO.min, PRICE_RATIO.max);
}

export function clampPurse(value) {
	if (!Number.isNumeric(value)) return -1;
	return Math.max(value, -1);
}
