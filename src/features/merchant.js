import {
	ErrorPF2e,
	calculateItemPrice,
	flagPath,
	getActionGlyph,
	getBrowserTab,
	getFlag,
	getHighestName,
	getSetting,
	getTabResults,
	openBrowserTab,
	registerWrapper,
	render,
	setFlag,
	subLocalize,
	transferItemToActor,
} from "module-api";
import { BuyItems } from "../apps/merchant/buy";
import { createSocket, wrapperError } from "../misc";

const socket = createSocket("merchant", onSocket);

const localize = subLocalize("merchant");

const ITEM_PREPARE_DERIVED_DATA =
	"CONFIG.Item.documentClass.prototype.prepareDerivedData";
const LOOT_TRANSFER_ITEM_TO_ACTOR =
	"CONFIG.PF2E.Actor.documentClasses.loot.prototype.transferItemToActor";
const ACTOR_TRANSFER_ITEM_TO_ACTOR =
	"CONFIG.Actor.documentClass.prototype.transferItemToActor";

const PULL_LIMIT = 100;

export const PRICE_RATIO = {
	min: 0.1,
	max: 5,
	step: 0.1,
	buy: 0.5,
	sell: 1,
};

export function registerMerchant() {
	return {
		settings: [
			{
				key: "merchant",
				type: Boolean,
				default: false,
				requiresReload: true,
			},
		],
		init: (isGM) => {
			if (!getSetting("merchant")) return;

			Hooks.on("renderLootSheetPF2e", renderLootSheetPF2e);

			if (isGM) {
				socket.activate();
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
	};
}

function onSocket(packet, userId) {
	switch (packet.type) {
		case "buy-deal":
			makeBuyDeal(packet, userId);
			break;
	}
}

async function renderLootSheetPF2e(sheet, html) {
	const actor = sheet.actor;
	if (!actor?.isMerchant) return;

	const isGM = game.user.isGM;
	const {
		noCoins = false,
		buyItems = false,
		priceRatio = 1,
		infiniteStocks = false,
		infiniteItems = {},
	} = getFlag(actor, "merchant") ?? {};

	if (isGM) {
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
			.find("[data-action=pull-from-browser]")
			.on("click", (event) => pullFromBrowser(event, actor));
		better
			.find("[data-action=open-equipment-tab]")
			.on("click", (event) => openEquipmentTab());
		better
			.find("[data-action=open-buy-settings]")
			.on("click", (event) => openBuySettings(event, actor));
	}

	const itemTypes = html
		.find(".content .sheet-body [data-item-types]")
		.filter("[data-item-types!=treasure]");

	let hasInfiniteStock = infiniteStocks;

	if (infiniteStocks && isGM) {
		itemTypes.find(".quantity a").remove();
	} else if (!infiniteStocks) {
		const items = itemTypes.find("[data-item-id]");
		const tooltip = localize.path("infinite-item.tooltip");

		for (const item of items) {
			const itemId = item.dataset.itemId;
			const isInfinite = !!infiniteItems[itemId];

			if (isGM) {
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
			}

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

	await transferItemToActor(buyer, item, itemQuantity);

	createBuyMessage(
		buyer,
		seller,
		item,
		itemQuantity,
		senderId,
		selectedPurse.goldValue,
	);
}

export async function createBuyMessage(
	buyer,
	seller,
	item,
	quantity,
	senderId,
	goldValue,
) {
	const buyerName = getHighestName(buyer);

	const buyMessage = {
		user: senderId ?? game.user.id,
		speaker: ChatMessage.getSpeaker({
			actor: buyer,
			alias: buyerName,
		}),
		flavor: await renderTemplate(
			"systems/pf2e/templates/chat/action/flavor.hbs",
			{
				action: {
					title: "PF2E.Actions.Interact.Title",
					subtitle: localize("sold.subtitle"),
					glyph: getActionGlyph(1),
				},
				traits: [
					{
						name: "manipulate",
						label: CONFIG.PF2E.featTraits.manipulate,
						description: CONFIG.PF2E.traitsDescriptions.manipulate,
					},
				],
			},
		),
		content: localize("sold.message", {
			buyer: buyerName,
			quantity,
			item: item.name,
			seller: getHighestName(seller),
			price: parseFloat(goldValue.toFixed(2)),
		}),
		type: CONST.CHAT_MESSAGE_TYPES.EMOTE,
	};

	ChatMessage.implementation.create(buyMessage);
}

function openEquipmentTab() {
	openBrowserTab("equipment", true);
}

function pullFromBrowser(event, actor) {
	const tab = getBrowserTab("equipment");
	if (!tab.isInitialized) {
		localize.warn("browser.noTab");
		openEquipmentTab();
		return;
	}

	const nb = tab.currentIndex.length;
	if (nb > PULL_LIMIT) {
		localize.error("browser.limit", { limit: PULL_LIMIT });
		openEquipmentTab();
		return;
	}

	const name = actor.name;
	const msg = localize("browser.dialogMsg", { nb, name });

	Dialog.confirm({
		content: `<div style="margin-bottom: 0.5em;">${msg}</div>`,
		title: `${name} - ${localize("browser.pull")}`,
		yes: async (html) => {
			localize.info("browser.wait");
			const results = (await getTabResults(tab)).filter(Boolean);
			actor.createEmbeddedDocuments("Item", results);
		},
	});
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
