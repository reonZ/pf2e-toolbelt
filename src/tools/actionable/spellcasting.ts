import {
    AttributeString,
    CastOptions,
    CreaturePF2e,
    MagicTradition,
    PhysicalItemPF2e,
    Predicate,
    SpellcastingEntry,
    SpellcastingSheetData,
    SpellCollection,
    SpellCollectionData,
    SpellPF2e,
    Statistic,
} from "foundry-helpers";
import { createCounteractStatistic, R } from "foundry-helpers/dist";

/**
 * https://github.com/foundryvtt/pf2e/blob/522dec9d289c7da8b69ac0167b11ccd639871fef/src/module/item/spellcasting-entry/item-spellcasting.ts#L13
 */
class ItemCastSpellcasting implements SpellcastingEntry<CreaturePF2e> {
    id: string;

    name: string;

    actor: CreaturePF2e;

    statistic: Statistic;

    tradition: MagicTradition | null;

    original: SpellcastingEntry<CreaturePF2e> | null;

    castPredicate: Predicate;

    constructor({
        id,
        name,
        actor,
        statistic,
        tradition,
        original,
        castPredicate,
    }: {
        id: string;
        name: string;
        actor: CreaturePF2e;
        statistic: Statistic;
        tradition: Maybe<MagicTradition>;
        original: Maybe<SpellcastingEntry<CreaturePF2e>>;
        castPredicate: Predicate;
    }) {
        this.id = id;
        this.name = name;
        this.actor = actor;
        this.statistic = statistic;
        this.tradition = tradition ?? null;
        this.original = original ?? null;
        this.castPredicate = castPredicate;
    }

    get counteraction(): Statistic {
        return createCounteractStatistic(this);
    }

    get attribute(): AttributeString {
        return this.statistic.attribute ?? "cha";
    }

    get category(): "items" {
        return "items";
    }

    get sort(): number {
        return Math.max(0, ...this.actor.itemTypes.spellcastingEntry.map((e) => e.sort)) + 10;
    }

    get spells(): null {
        return null;
    }

    get isFlexible(): false {
        return false;
    }

    get isFocusPool(): false {
        return false;
    }

    get isEphemeral(): true {
        return true;
    }

    canCast(spell: SpellPF2e, { origin }: { origin?: Maybe<PhysicalItemPF2e> } = {}): boolean {
        if (!origin || !spell.actor?.isOfType("character", "npc")) return false;
        const rollOptions = new Set([
            ...this.actor.getRollOptions(),
            ...origin.getRollOptions("item"),
            ...spell.getRollOptions("spell", { includeVariants: true }),
        ]);
        return this.castPredicate.test(rollOptions);
    }

    async cast(spell: SpellPF2e, options: CastOptions = {}): Promise<void> {
        const message = options.message ?? true;
        if (message && this.canCast(spell, { origin: spell.parentItem })) {
            spell.system.location.value = this.id;
            await spell.toMessage(null, { rollMode: options.rollMode, data: { castRank: spell.rank } });
        }
    }

    async getSheetData({ spells }: { spells?: SpellCollection<CreaturePF2e> } = {}): Promise<SpellcastingSheetData> {
        const collectionData: SpellCollectionData = (await spells?.getSpellData()) ?? { groups: [], prepList: null };

        return {
            ...R.pick(this, ["category", "tradition", "sort", "isFlexible", "isFocusPool", "isEphemeral"]),
            ...collectionData,
            id: spells?.id ?? this.id,
            name: spells?.name ?? this.name,
            statistic: this.statistic.getChatData(),
            attribute: this.statistic.attribute,
            hasCollection: !!spells?.size,
            usesSpellProficiency: false,
        };
    }
}

export { ItemCastSpellcasting };
