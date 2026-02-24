import { ItemPF2e } from "foundry-helpers";

function itemCanBeRefreshed(item: ItemPF2e): boolean {
    return !item.system.rules.some((r) => typeof r.key === "string" && ["ChoiceSet", "GrantItem"].includes(r.key));
}

export { itemCanBeRefreshed };
