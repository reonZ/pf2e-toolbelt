import { getFlag } from "../shared/flags";
import { registerWrapper, wrapperError } from "../shared/libwrapper";
import { subLocalize } from "../shared/localize";
import { flagPath, templatePath } from "../shared/path";
import { getSetting } from "../shared/settings";

const ITEM_PREPARE_DERIVED_DATA =
	"CONFIG.Item.documentClass.prototype.prepareDerivedData";
const LOOT_TRANSFERT_ITEM_TO_ACTOR =
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
				LOOT_TRANSFERT_ITEM_TO_ACTOR,
				lootTranfertItemToActor,
				"OVERRIDE",
			);
		},
	};
}

async function renderLootSheetPF2e(sheet, html) {
	const actor = sheet.actor;
	if (!actor?.isMerchant) return;

	const maxRatio = 5;
	const { noCoins = false, priceRatio = 1 } = getFlag(actor, "merchant") ?? {};

	const template = await renderTemplate(templatePath("merchant/sheet"), {
		noCoins,
		priceRatio: {
			value: Math.clamped(priceRatio, 0, maxRatio),
			max: maxRatio,
		},
		actorUUID: actor.uuid,
		i18n: subLocalize("merchant"),
		flagPath: (str) => flagPath(`merchant.${str}`),
	});

	html.find(".sheet-sidebar .editor").before(template);
}

function itemPrepareDerivedData(wrapped) {
	wrapped();

	try {
		if (!this.isOfType("physical")) return;

		const actor = this.actor;
		if (!actor?.isMerchant) return;

		const priceRatio = getFlag(actor, "merchant.priceRatio");
		if (priceRatio == null || priceRatio === 1) return;

		this.system.price.value = this.system.price.value.scale(priceRatio);
	} catch (error) {
		wrapperError("merchant", ITEM_PREPARE_DERIVED_DATA);
	}
}

async function lootTranfertItemToActor(
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
