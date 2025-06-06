import { ActorPF2e, createHook, createToggleKeybind, ItemPF2e } from "module-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";
import { ConditionManager } from ".";

class ConditionManagerTool extends ModuleTool<ToolSettings> {
    #preCreateItemHook = createHook("preCreateItem", this.#onPreCreateItem.bind(this));

    #manageKeybind = createToggleKeybind({
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

export { ConditionManagerTool };
