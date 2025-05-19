import { createHook, ItemPF2e, ItemSourcePF2e } from "module-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";

class UnidedTool extends ModuleTool<ToolSettings> {
    #preCreateItemHook = createHook("preCreateItem", this.#onPrecreateItem.bind(this));
    #preUpdateItemHook = createHook("preUpdateItem", this.#onPreUpdateItem.bind(this));

    get key(): "unided" {
        return "unided";
    }

    get settingsSchema(): ToolSettingsList<ToolSettings> {
        return [
            {
                key: "create",
                type: Boolean,
                default: false,
                scope: "world",
                onChange: (value) => {
                    this.#preCreateItemHook.toggle(value);
                },
            },
            {
                key: "update",
                type: Boolean,
                default: false,
                scope: "world",
                onChange: (value) => {
                    this.#preUpdateItemHook.toggle(value);
                },
            },
        ] as const;
    }

    init(): void {
        this.#preCreateItemHook.toggle(this.settings.create);
        this.#preUpdateItemHook.toggle(this.settings.update);
    }

    #onPrecreateItem(item: ItemPF2e) {
        if (item.isOfType("physical")) {
            item.updateSource({ "system.identification.unidentified.img": item.img });
        }
    }

    #onPreUpdateItem(item: ItemPF2e, data: DeepPartial<ItemSourcePF2e>) {
        if ("img" in item && item.isOfType("physical")) {
            foundry.utils.setProperty(data, "system.identification.unidentified.img", data.img);
        }
    }
}

type ToolSettings = {
    create: boolean;
    update: boolean;
};

export { UnidedTool };
