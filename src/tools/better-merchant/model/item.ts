import { ActorPF2e, PhysicalItemPF2e, R, SYSTEM } from "foundry-helpers";
import { BaseFilter, CalulatedFilterPrice, DefaultFilter } from ".";
import { ItemFilterData, zBuyDefaultFilter, zItemFilter, zSellDefaultFilter } from "..";

class BuyDefaultFilter extends DefaultFilter<typeof zBuyDefaultFilter> {
    static schema = zBuyDefaultFilter;

    getRatio(item: PhysicalItemPF2e<ActorPF2e>): number {
        const ratio = this.ratio;
        return item.isOfType("treasure") ? Math.max(ratio, 1) : ratio;
    }

    calculatePrice(item: PhysicalItemPF2e<ActorPF2e>, qty?: number): CalulatedFilterPrice {
        const ratio = this.getRatio(item);
        return calculateItemPrice(this, item, qty, ratio);
    }
}

class SellDefaultFilter extends DefaultFilter<typeof zSellDefaultFilter> {
    static schema = zSellDefaultFilter;

    calculatePrice(item: PhysicalItemPF2e<ActorPF2e>, qty?: number): CalulatedFilterPrice {
        return calculateItemPrice(this, item, qty);
    }
}

class ItemFilter extends BaseFilter<typeof zItemFilter> {
    static #wordSegmenter?: Intl.Segmenter | { segment(term: string): { segment: string }[] };

    static schema = zItemFilter;

    /**
     * loose reimplementation of
     * https://github.com/foundryvtt/pf2e/blob/dfb9e2b53fc36a3525dec1706d24ec2bbafa6322/src/module/apps/compendium-browser/tabs/base.svelte.ts#L77
     */
    filterItemByText(item: PhysicalItemPF2e<ActorPF2e>): boolean {
        const textFilter = this.filter.search?.text;
        if (!R.isString(textFilter)) return true;

        const itemName = item.name.toLocaleLowerCase(game.i18n.lang);
        const wordSegmenter = (ItemFilter.#wordSegmenter ??=
            "Segmenter" in Intl
                ? new Intl.Segmenter(game.i18n.lang, { granularity: "word" })
                : {
                      segment(term: string): { segment: string }[] {
                          return [{ segment: term }];
                      },
                  });
        const segments = Array.from(wordSegmenter.segment(textFilter))
            .map((t) => t.segment.toLocaleLowerCase(game.i18n.lang).replace(/['"]/g, ""))
            .filter((t) => t.length > 1);

        return segments.some((segment) => itemName.includes(segment));
    }

    testItem(item: PhysicalItemPF2e<ActorPF2e>): boolean {
        if (!this.filterItemByText(item)) return false;

        const tab = game.pf2e.compendiumBrowser.tabs.equipment;
        const { checkboxes, source, traits, ranges, level } = this.filter;

        // Level
        const itemLevel = item.level;
        if (R.isPlainObject(level) && (itemLevel < (level.from ?? 0) || itemLevel > (level.to ?? 30))) return false;

        // Price
        const filterPrice = ranges?.price?.values;
        const itemPrice = item.price.value.copperValue;
        if (
            R.isPlainObject(filterPrice) &&
            (itemPrice < (filterPrice.min ?? 0) || itemPrice > (filterPrice.max ?? Infinity))
        )
            return false;

        // Item type
        const filterItemTypes = checkboxes?.itemTypes?.selected;
        if (R.isArray(filterItemTypes) && filterItemTypes.length && !filterItemTypes.includes(item.type)) return false;

        const itemCategory = "category" in item ? (item.category as string) : "";
        const itemGroup = "group" in item ? (item.group as string) : "";

        // Armor
        const filterArmorTypes = checkboxes?.armorTypes?.selected;
        if (
            R.isArray(filterArmorTypes) &&
            filterArmorTypes.length &&
            !tab["arrayIncludes"](filterArmorTypes, [itemCategory, itemGroup])
        )
            return false;

        // Weapon categories
        const filterWeaponTypes = checkboxes?.weaponTypes?.selected;
        if (
            R.isArray(filterWeaponTypes) &&
            filterWeaponTypes.length &&
            !tab["arrayIncludes"](filterWeaponTypes, [itemCategory, itemGroup])
        )
            return false;

        // Traits
        if (
            R.isPlainObject(traits) &&
            !tab["filterTraits"]([...item.traits], traits.selected ?? [], traits.conjunction ?? "and")
        )
            return false;

        // Source
        const filterSource = source?.selected;
        const itemSource = SYSTEM.sluggify(item.system.publication?.title ?? "").trim();
        if (R.isArray(filterSource) && filterSource.length && !filterSource.includes(itemSource)) return false;

        // Rarity
        const filterRarity = checkboxes?.rarity?.selected;
        if (R.isArray(filterRarity) && filterRarity.length && !filterRarity.includes(item.rarity)) return false;

        return true;
    }

    testFilter(item: PhysicalItemPF2e<ActorPF2e>): boolean {
        return this.enabled && this.testItem(item);
    }

    getRatio(): number {
        return this.ratio;
    }

    calculatePrice(item: PhysicalItemPF2e<ActorPF2e>, qty?: number): CalulatedFilterPrice {
        return calculateItemPrice(this, item, qty);
    }
}

interface ItemFilter extends ItemFilterData {}

function calculateItemPrice(
    filter: BuyDefaultFilter | SellDefaultFilter | ItemFilter,
    item: PhysicalItemPF2e<ActorPF2e>,
    qty: number | undefined,
    ratio = filter.getRatio(item),
): CalulatedFilterPrice {
    let original = game.pf2e.Coins.fromPrice(item.price, qty ?? item.quantity);

    if (SYSTEM.isSF2e) {
        original = new game.pf2e.Coins({ credits: Math.ceil(original.copperValue / 10) });
    }

    return {
        original,
        ratio,
        value: original.scale(ratio),
    };
}

export { BuyDefaultFilter, ItemFilter, SellDefaultFilter };
