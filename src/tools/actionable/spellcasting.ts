import {
    AttributeString,
    CastOptions,
    CharacterPF2e,
    MagicTradition,
    OneToTen,
    PhysicalItemPF2e,
    Predicate,
    SpellcastingEntry,
    SpellcastingSheetData,
    SpellcastingSlotGroup,
    SpellCollection,
    SpellCollectionData,
    SpellPF2e,
    Statistic,
} from "foundry-helpers";
import { createCounteractStatistic, ordinalString, R } from "foundry-helpers/dist";

/**
 * https://github.com/foundryvtt/pf2e/blob/522dec9d289c7da8b69ac0167b11ccd639871fef/src/module/item/spellcasting-entry/item-spellcasting.ts#L13
 */
class ItemCastSpellcasting implements SpellcastingEntry<CharacterPF2e> {
    id: string;

    name: string;

    actor: CharacterPF2e;

    statistic: Statistic;

    tradition: MagicTradition | null;

    original: SpellcastingEntry<CharacterPF2e> | null;

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
        actor: CharacterPF2e;
        statistic: Statistic;
        tradition: Maybe<MagicTradition>;
        original: Maybe<SpellcastingEntry<CharacterPF2e>>;
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

    get isVirtual(): true {
        return true;
    }

    canCast(spell: SpellPF2e, { origin }: { origin?: Maybe<PhysicalItemPF2e> } = {}): boolean {
        if (!origin || !spell.actor?.isOfType("character")) return false;
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

    async getSheetData({ spells }: { spells?: SpellCollection<CharacterPF2e> } = {}): Promise<SpellcastingSheetData> {
        const collectionData = spells ? this.#getEphemeralData(spells) : { groups: [], prepList: null };

        return {
            ...R.pick(this, ["category", "tradition", "sort", "isFlexible", "isFocusPool", "isEphemeral", "isVirtual"]),
            ...collectionData,
            id: spells?.id ?? this.id,
            name: spells?.name ?? this.name,
            statistic: this.statistic.getChatData(),
            attribute: this.statistic.attribute,
            hasCollection: !!spells?.size,
            usesSpellProficiency: false,
        };
    }

    /**
     * modified version of
     * https://github.com/foundryvtt/pf2e/blob/a83c14115be999c773bee2c05c59348adf631650/src/module/item/spellcasting-entry/collection.ts#L310
     * to handle cantrips
     */
    #getEphemeralData(collection: SpellCollection<CharacterPF2e>): SpellCollectionData {
        const groupedByRank = R.groupBy(Array.from(collection.values()), (s) => s.rank);
        const groups = R.entries(groupedByRank)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([rankStr, [spell]]): SpellcastingSlotGroup => {
                const rank = spell.isCantrip && !spell.system.location.autoHeightenLevel ? 0 : Number(rankStr);
                const label =
                    rank === 0
                        ? "PF2E.Actor.Creature.Spellcasting.Cantrips"
                        : game.i18n.format("PF2E.Item.Spell.Rank.Ordinal", { rank: ordinalString(rank) });

                return {
                    id: rank === 0 ? "cantrips" : (rank as OneToTen),
                    label,
                    maxRank: 10,
                    active: [{ spell, expended: spell.parentItem?.uses.value === 0 }],
                };
            });

        return { groups, prepList: null };
    }
}

export { ItemCastSpellcasting };
