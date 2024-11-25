import { ItemPF2e, ItemSourcePF2e } from "module-helpers";
import { createTool } from "../tool";

const { config, settings, hooks } = createTool({
    name: "unided",
    settings: [
        {
            key: "create",
            type: Boolean,
            default: false,
            onChange: (value) => {
                hooks.preCreateItem.toggle(value);
            },
        },
        {
            key: "update",
            type: Boolean,
            default: false,
            onChange: (value) => {
                hooks.preUpdateItem.toggle(value);
            },
        },
    ],
    hooks: [
        {
            event: "preCreateItem",
            listener: onPrecreateItem,
        },
        {
            event: "preUpdateItem",
            listener: onPreUpdateItem,
        },
    ],
    init: () => {
        hooks.preCreateItem.toggle(settings.create);
        hooks.preUpdateItem.toggle(settings.update);
    },
} as const);

function onPrecreateItem(item: ItemPF2e) {
    if (!item.img || !item.isOfType("physical")) return;
    item.updateSource({ "system.identification.unidentified.img": item.img });
}

function onPreUpdateItem(item: ItemPF2e, data: DeepPartial<ItemSourcePF2e>) {
    if (!("img" in item) || !item.isOfType("physical")) return;
    foundry.utils.setProperty(data, "system.identification.unidentified.img", data.img);
}

export { config as unidedTool };
