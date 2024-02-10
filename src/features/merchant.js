import { getFlag } from "../shared/flags";
import { registerWrapper, wrapperError } from "../shared/libwrapper";
import { subLocalize } from "../shared/localize";
import { flagPath, templatePath } from "../shared/path";
import { getSetting } from "../shared/settings";

const ITEM_PREPARE_DERIVED_DATA =
	"CONFIG.Item.documentClass.prototype.prepareDerivedData";
const LOOT_TRANSFER_ITEM_TO_ACTOR =
	"CONFIG.PF2E.Actor.documentClasses.loot.prototype.transferItemToActor";

export function registerMerchant() {
	return {
		settings: [
			{
				name: "merchant",
				type: Boolean,
				default: false,
				requiresReload: true,
			},
		],
		init: () => {
			if (!getSetting("merchant")) return;
			Hooks.on("renderLootSheetPF2e", renderLootSheetPF2e);
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
		},
	};
}

async function renderLootSheetPF2e(sheet, html) {
	const actor = sheet.actor;
	if (!actor?.isMerchant) return;

	const maxRatio = 5;
	const ratioStep = 0.1;
	const {
		noCoins = false,
		priceRatio = 1,
		infiniteStocks = false,
	} = getFlag(actor, "merchant") ?? {};

	const template = await renderTemplate(templatePath("merchant/sheet"), {
		noCoins,
		infiniteStocks,
		priceRatio: {
			value: Math.clamped(priceRatio, 0, maxRatio),
			max: maxRatio,
			min: ratioStep,
			step: ratioStep,
		},
		actorUUID: actor.uuid,
		i18n: subLocalize("merchant"),
		flagPath: (str) => flagPath(`merchant.${str}`),
	});

	html.find(".sheet-sidebar .editor").before(template);

	if (infiniteStocks) {
		html.find(".content .sheet-body .coinage .wealth h3:last span").html("-");
		html
			.find(".content .sheet-body [data-item-types]")
			.filter("[data-item-types!=treasure]")
			.find(".quantity a")
			.remove();
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

		const flags = getFlag(actor, "merchant");
		if (!flags) return;

		const { priceRatio, infiniteStocks } = flags;

		if (typeof priceRatio === "number" && priceRatio !== 1) {
			this.system.price.value = this.system.price.value.scale(priceRatio);
		}

		if (typeof infiniteStocks === "boolean" && infiniteStocks) {
			this.system.quantity = 9999;
		}
	} catch (error) {
		wrapperError("merchant", ITEM_PREPARE_DERIVED_DATA);
	}
}

async function lootTranferItemToActor(
	targetActor,
	item,
	quantity,
	containerId,
	newStack = false,
) {
	const thisSuper = Actor.implementation.prototype;

	if (!(this.isOwner && targetActor.isOwner)) {
		return thisSuper.transferItemToActor(
			targetActor,
			item,
			quantity,
			containerId,
			newStack,
		);
	}
	if (this.isMerchant && item.isOfType("physical")) {
		const itemValue = game.pf2e.Coins.fromPrice(item.price, quantity);
		if (await targetActor.inventory.removeCoins(itemValue)) {
			if (!getFlag(this, "merchant.noCoins")) {
				await item.actor.inventory.addCoins(itemValue);
			}
			return thisSuper.transferItemToActor(
				targetActor,
				item,
				quantity,
				containerId,
				newStack,
			);
		}
		if (this.isLoot) {
			throw ErrorPF2e("Loot transfer failed");
		}
		return null;
	}

	return thisSuper.transferItemToActor(
		targetActor,
		item,
		quantity,
		containerId,
		newStack,
	);
}
