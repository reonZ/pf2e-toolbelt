import { KeybindingActionConfig, ToggleableHook, ToggleableKeybind } from "foundry-helpers";
import { ActorPF2e, ItemPF2e } from "foundry-pf2e";
import { ModuleTool, ToolSettingsList } from "module-tool";
import { ConditionManager } from ".";

export class ConditionManagerTool extends ModuleTool<ToolSettings> {
    #preCreateItemHook = new ToggleableHook("preCreateItem", this.#onPreCreateItem.bind(this));

    #manageKeybind = new ToggleableKeybind({
        name: "manage",
        onDown: () => {
            this.#preCreateItemHook.activate();
        },
        onUp: () => {
            this.#preCreateItemHook.disable();
        },
    });

    get key(): "conditionManager" {
        return "conditionManager";
    }

    get settingsSchema(): ToolSettingsList<ToolSettings> {
        return [
            {
                key: "enabled",
                type: Boolean,
                default: false,
                scope: "user",
                onChange: (value) => {
                    this.#manageKeybind.toggle(value);
                },
            },
        ];
    }

    get keybindsSchema(): KeybindingActionConfig[] {
        return [this.#manageKeybind.configs];
    }

    init(): void {
        if (this.settings.enabled) {
            this.#manageKeybind.activate();
        }
    }

    #onPreCreateItem(item: ItemPF2e<ActorPF2e>) {
        if (item.isOfType("condition") && item.actor) {
            new ConditionManager(this, item).render(true);
            return false;
        }
    }
}

type ToolSettings = {
    enabled: boolean;
};
