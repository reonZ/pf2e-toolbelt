import { ActorPF2e, createHook, ItemPF2e } from "module-helpers";
import { ModuleTool, ToolSetting } from "module-tool";
import { ConditionManager } from ".";

class ConditionManagerTool extends ModuleTool<Settings> {
    #preCreateItemHook = createHook("preCreateItem", this.#onPreCreateItem.bind(this));
    #keybindActions = {
        down: () => {},
        up: () => {},
    };

    get key(): "conditionManager" {
        return "conditionManager";
    }

    get settings(): ReadonlyArray<ToolSetting<Settings>> {
        return [
            {
                key: "enabled",
                type: Boolean,
                default: false,
                scope: "user",
                onChange: (value) => {
                    this.#setKeybindAction(value);
                },
            },
        ] as const;
    }

    get keybinds(): KeybindingActionConfig[] {
        return [
            {
                name: "manage",
                onDown: () => this.#keybindActions.down(),
                onUp: () => this.#keybindActions.up(),
            },
        ];
    }

    init(): void {
        this.#setKeybindAction();
    }

    #setKeybindAction(enabled = this.getSetting("enabled")) {
        if (enabled) {
            this.#keybindActions = {
                down: () => this.#preCreateItemHook.activate(),
                up: () => this.#preCreateItemHook.disable(),
            };
        } else {
            // we simulate a key-up before unbinding the key
            this.#keybindActions.up();
            this.#keybindActions = {
                down: () => {},
                up: () => {},
            };
        }
    }

    #onPreCreateItem(item: ItemPF2e<ActorPF2e>) {
        if (item.isOfType("condition") && item.actor) {
            new ConditionManager(item).render(true);
            return false;
        }
    }
}

type Settings = {
    enabled: boolean;
};

export { ConditionManagerTool };
