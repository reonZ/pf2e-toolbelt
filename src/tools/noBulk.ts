import { ActorPF2e, Bulk, InventoryBulk, TreasurePF2e, wrapperError } from "module-helpers";
import { createTool } from "../tool";

const ACTOR_PREPARE_EMBEDDED_DOCUMENTS =
    "CONFIG.Actor.documentClass.prototype.prepareEmbeddedDocuments";

const { config, settings, wrappers } = createTool({
    name: "noBulk",
    settings: [
        {
            key: "dropped",
            type: Boolean,
            default: false,
            requiresReload: true,
        },
        {
            key: "coins",
            type: Boolean,
            default: false,
            requiresReload: true,
        },
    ],
    wrappers: [
        {
            key: "dropped",
            path: "CONFIG.Actor.documentClass.prototype.prepareEmbeddedDocuments",
            callback: actorPrepareEmbeddedDocuments,
        },
        {
            key: "coins",
            path: "CONFIG.PF2E.Item.documentClasses.treasure.prototype.prepareBaseData",
            callback: treasurePreparedBaseData,
        },
    ],
    init: () => {
        wrappers.dropped.toggle(settings.dropped);
        wrappers.coins.toggle(settings.coins);
    },
} as const);

function actorPrepareEmbeddedDocuments(this: ActorPF2e, wrapped: libWrapper.RegisterCallback) {
    wrapped();

    try {
        const InventoryBulkClass = this.inventory.bulk.constructor as typeof InventoryBulk;

        let _value: Bulk | null = null;

        Object.defineProperty(this.inventory.bulk, "value", {
            get(this: InventoryBulk): Bulk {
                if (_value) return _value;

                _value = InventoryBulkClass.computeTotalBulk(
                    this.actor.inventory.filter(
                        (item) =>
                            !item.isInContainer && item.system.equipped.carryType !== "dropped"
                    ),
                    this.actor
                );

                return _value;
            },
        });
    } catch (error) {
        wrapperError(ACTOR_PREPARE_EMBEDDED_DOCUMENTS, error);
    }
}

function treasurePreparedBaseData(this: TreasurePF2e, wrapped: libWrapper.RegisterCallback) {
    wrapped();

    if (this.isCoinage) {
        this.system.bulk.value = 0;
    }
}

export { config as noBulkTool };
