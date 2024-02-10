import { registerActorPreparedEmbeddedDocuments } from "../shared/actor";
import { registerWrapper, wrapperError } from "../shared/libwrapper";
import { getSetting } from "../shared/settings";

const TREASURE_PREPARE_BASE_DATA =
	"CONFIG.PF2E.Item.documentClasses.treasure.prototype.prepareBaseData";

export function registerNobulk() {
	return {
		settings: [
			{
				name: "nobulk",
				type: Boolean,
				default: false,
				requiresReload: true,
			},
			{
				name: "nobulk-coins",
				type: Boolean,
				default: false,
				requiresReload: true,
			},
		],
		init: () => {
			if (getSetting("nobulk")) {
				registerActorPreparedEmbeddedDocuments(
					"nobulk",
					actorPrepareEmbeddedDocuments,
				);
			}
			if (getSetting("nobulk-coins")) {
				registerWrapper(
					TREASURE_PREPARE_BASE_DATA,
					treasurePrepareBaseData,
					"WRAPPER",
				);
			}
		},
	};
}

function treasurePrepareBaseData(wrapped) {
	wrapped();

	try {
		if (this.isCoinage) this.system.bulk.value = 0;
	} catch {
		wrapperError("nobulk", TREASURE_PREPARE_BASE_DATA);
	}
}

function actorPrepareEmbeddedDocuments() {
	const InventoryBulk = this.inventory.bulk.constructor;

	let _value = null;

	Object.defineProperty(this.inventory.bulk, "value", {
		get() {
			if (_value) return _value;
			_value = InventoryBulk.computeTotalBulk(
				this.actor.inventory.filter(
					(item) =>
						!item.isInContainer && item.system.equipped.carryType !== "dropped",
				),
				this.actor.size,
			);
			return _value;
		},
	});
}
