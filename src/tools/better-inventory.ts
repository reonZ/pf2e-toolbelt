import {
    ActorPF2e,
    Bulk,
    createToggleableWrapper,
    InventoryBulk,
    MODULE,
    TreasurePF2e,
} from "module-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";

class BetterInventoryTool extends ModuleTool<ToolSettings> {
    #actorPrepareEmbeddedDocumentsWrapper = createToggleableWrapper(
        "WRAPPER",
        "CONFIG.Actor.documentClass.prototype.prepareEmbeddedDocuments",
        this.#actorPrepareEmbeddedDocuments,
        { context: this }
    );

    #treasurePreparedBaseDataWrapper = createToggleableWrapper(
        "WRAPPER",
        "CONFIG.PF2E.Item.documentClasses.treasure.prototype.prepareBaseData",
        this.#treasurePreparedBaseData,
        { context: this }
    );

    get key(): "betterInventory" {
        return "betterInventory";
    }

    get settingsSchema(): ToolSettingsList<ToolSettings> {
        return [
            {
                key: "coins",
                type: Boolean,
                default: false,
                scope: "world",
                requiresReload: true,
            },
            {
                key: "dropped",
                type: Boolean,
                default: false,
                scope: "world",
                requiresReload: true,
            },
        ];
    }

    init(isGM: boolean): void {
        this.#actorPrepareEmbeddedDocumentsWrapper.toggle(this.settings.dropped);
        this.#treasurePreparedBaseDataWrapper.toggle(this.settings.coins);
    }

    #actorPrepareEmbeddedDocuments(actor: ActorPF2e, wrapped: libWrapper.RegisterCallback) {
        wrapped();

        try {
            const InventoryBulkClass = actor.inventory.bulk.constructor as typeof InventoryBulk;

            // we cache the computed value
            let _value: Bulk | undefined;

            // our only/best solution is to re-define the ActorInventory#bulk#value getter
            Object.defineProperty(actor.inventory.bulk, "value", {
                get(this: InventoryBulk): Bulk {
                    if (_value) {
                        return _value;
                    }

                    _value = InventoryBulkClass.computeTotalBulk(
                        this.actor.inventory.filter((item) => {
                            return (
                                !item.isInContainer && item.system.equipped.carryType !== "dropped"
                            );
                        }),
                        this.actor
                    );

                    return _value;
                },
            });
        } catch (error) {
            MODULE.Error("An error occured while trying to make dropped items weighless.");
        }
    }

    #treasurePreparedBaseData(treasure: TreasurePF2e, wrapped: libWrapper.RegisterCallback) {
        wrapped();

        if (treasure.isCoinage) {
            treasure.system.bulk.value = 0;
        }
    }
}

type ToolSettings = {
    coins: boolean;
    dropped: boolean;
};

export { BetterInventoryTool };
