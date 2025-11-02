import { ItemPF2e } from "module-helpers";

function itemCanBeRefreshed(item: ItemPF2e): boolean {
    return !item.system.rules.some(
        (r) => typeof r.key === "string" && ["ChoiceSet", "GrantItem"].includes(r.key)
    );
}

export { itemCanBeRefreshed };
