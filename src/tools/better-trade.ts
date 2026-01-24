import { createCreatureSheetWrapper, CreaturePF2e, DropCanvasItemDataPF2e, ItemPF2e } from "module-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";

class BetterTradeTool extends ModuleTool<ToolSettings> {
    #onDropItemWrapper = createCreatureSheetWrapper("WRAPPER", "_onDropItem", this.#creatureSheetOnDropItem, {
        context: this,
    });

    get key(): "betterTrade" {
        return "betterTrade";
    }

    get settingsSchema(): ToolSettingsList<ToolSettings> {
        return [
            {
                key: "invertTrade",
                type: Boolean,
                default: false,
                scope: "user",
                playerOnly: true,
                onChange: (value: boolean) => {
                    if (!game.user.isGM) {
                        this.#onDropItemWrapper.toggle(value);
                    }
                },
            },
        ];
    }

    ready(isGM: boolean): void {
        if (!isGM && this.settings.invertTrade) {
            this.#onDropItemWrapper.activate();
        }
    }

    async #creatureSheetOnDropItem(
        actor: CreaturePF2e,
        wrapped: libWrapper.RegisterCallback,
        event: DragEvent,
        data: DropCanvasItemDataPF2e & { fromInventory?: boolean },
    ): Promise<ItemPF2e[]> {
        if (!data.fromInventory || !data.uuid || fromUuidSync<ItemPF2e>(data.uuid)?.actor === actor) {
            return wrapped(event, data);
        }

        const newEvent = new DragEvent("drop", {
            altKey: event.altKey,
            shiftKey: !event.shiftKey,
            dataTransfer: event.dataTransfer,
        });

        return wrapped(newEvent, data);
    }
}

type ToolSettings = toolbelt.Settings["betterTrade"];

export { BetterTradeTool };
