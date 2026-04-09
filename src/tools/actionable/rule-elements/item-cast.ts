import {
    AttributeString,
    ConsumablePF2e,
    ConsumableSource,
    ConsumableTrait,
    CreaturePF2e,
    ItemPF2e,
    ItemSourcePF2e,
    ItemUUID,
    MagicTradition,
    ModelPropsFromRESchema,
    ModelPropsFromSchema,
    OneToTen,
    PhysicalItemPF2e,
    R,
    RuleElement,
    RuleElementOptions,
    RuleElementSchema,
    RuleElementSource,
    SpellPF2e,
    SpellSource,
    setHasElement,
} from "foundry-helpers";
import { MAGIC_TRADITIONS, SourceFromSchema } from "foundry-helpers/dist";
import { actionable } from "..";
import fields = foundry.data.fields;

function createItemCastRuleElement() {
    const RuleElementCls = game.pf2e.RuleElement;

    class ItemCastRuleElement extends RuleElementCls<ItemCastSchema> {
        constructor(data: ItemCastSource, options: RuleElementOptions) {
            data.priority ??= 99;
            data.requiresEquipped = false;
            data.requiresInvestment = false;

            super(data, options);

            if (!this.item.isOfType("physical")) {
                this.failValidation("parent item must be physical");
            }

            const uuid = this.resolveInjectedProperties(this.uuid);
            const type = fromUuidSync<ItemPF2e>(uuid)?.type;
            if (type !== "spell") {
                this.failValidation("uuid must be a valid spell uuid");
            }
        }

        static override defineSchema(): ItemCastSchema {
            return {
                ...super.defineSchema(),
                attribute: new fields.StringField({
                    required: false,
                    nullable: true,
                    blank: false,
                    choices: R.keys(CONFIG.PF2E.abilities),
                    initial: undefined,
                }),
                data: new fields.ObjectField(),
                dc: new fields.NumberField({
                    required: false,
                    nullable: true,
                    integer: true,
                    min: 1,
                    initial: undefined,
                }),
                max: new fields.NumberField({
                    required: false,
                    nullable: true,
                    integer: true,
                    min: 1,
                    initial: undefined,
                }),
                rank: new fields.NumberField<OneToTen, OneToTen, false, false, false>({
                    required: false,
                    nullable: false,
                    integer: true,
                    min: 1,
                    max: 10,
                    initial: undefined,
                }),
                tradition: new fields.StringField({
                    required: false,
                    nullable: true,
                    blank: false,
                    choices: R.keys(CONFIG.PF2E.magicTraditions),
                    initial: undefined,
                }),
                uuid: new fields.DocumentUUIDField({
                    required: true,
                    nullable: false,
                    label: "PF2E.UUID.Label",
                    type: "Item",
                }),
            };
        }

        get usableMax(): number {
            return this.max ?? 1;
        }

        get usableValue(): number {
            return this.data.value ?? this.usableMax;
        }

        override async preUpdateActor(): Promise<{ create: ItemSourcePF2e[]; delete: string[] }> {
            return { create: [], delete: [] };
        }

        override onApplyActiveEffects() {
            if (this.invalid || !this.actor.isOfType("character", "npc")) return;

            if (this.data.sourceId !== this.uuid || this.missingSpellData()) {
                return this.#setData();
            }

            if (this.test()) {
                const spellId = this.data.spell?._id as string;
                const item = this.createConsumable();

                actionable.setInMemory<VirtualSpellData>(this.actor, "spells", spellId, {
                    ...R.pick(this, ["attribute", "dc", "max", "tradition"]),
                    item,
                    parentId: this.item.id,
                    ruleIndex: this.sourceIndex as number,
                    value: this.data.value,
                });
            }
        }

        test(rollOptions?: string[] | Set<string> | undefined): boolean {
            if (!super.test(rollOptions) || this.missingSpellData()) return false;

            const item = this.item;
            const invested = item.isInvested;

            return invested === true || (invested === null && item.isEquipped);
        }

        missingSpellData() {
            return (
                !R.isString(this.data.entryId) ||
                !R.isPlainObject(this.data.spell) ||
                !R.isString(this.data.spell._id) ||
                this.data.spell.type !== "spell"
            );
        }

        createConsumable(): ConsumablePF2e<CreaturePF2e> {
            const actor = this.actor;
            const spellSource = this.data.spell as SpellSource & { _id: string };

            const traits = {
                rarity: spellSource.system.traits.rarity,
                value: ["consumable", ...spellSource.system.traits.value] as ConsumableTrait[],
            };

            if (traits.value.includes("magical") && traits.value.some((t) => setHasElement(MAGIC_TRADITIONS, t))) {
                traits.value.splice(traits.value.indexOf("magical"), 1);
            }

            traits.value.sort();

            const source: PreCreate<ConsumableSource> = {
                _id: this.data.entryId,
                img: this.item.img,
                name: this.item.name,
                system: {
                    bulk: { value: 0 },
                    category: "wand",
                    equipped: { carryType: "worn", handsHeld: 0 },
                    level: { value: this.item.level },
                    spell: spellSource,
                    traits,
                    usage: { value: "worn" },
                    uses: { value: this.usableValue, max: this.usableMax, autoDestroy: false },
                },
                type: "consumable",
            };

            const item = new Item.implementation(source, { parent: actor }) as ConsumablePF2e<CreaturePF2e>;

            item.consume = async (thisMany = 1) => {
                if (actor.spellcasting.canCastConsumable(item)) {
                    item.castEmbeddedSpell();
                } else {
                    const formatParams = { actor: actor.name, spell: item.name };
                    const message = game.i18n.format("PF2E.LackCastConsumableCapability", formatParams);
                    ui.notifications.warn(message);
                    return;
                }

                // infinite cast
                if (!this.max) return;

                const newValue = Math.max(this.usableValue - thisMany, 0);
                await this.updateData({ value: newValue });
            };

            return item;
        }

        updateData(changes: ItemCastUpdateDataArgs, sourceOnly: true): EmbeddedDocumentUpdateData | undefined;
        updateData(
            changes: ItemCastUpdateDataArgs,
            sourceOnly?: boolean,
        ): Promise<ItemPF2e<CreaturePF2e>[]> | undefined;
        updateData(
            changes: ItemCastUpdateDataArgs,
            sourceOnly?: boolean,
        ): EmbeddedDocumentUpdateData | Promise<ItemPF2e<CreaturePF2e>[]> | undefined {
            const sourceIndex = this.sourceIndex ?? -1;
            const rules = this.item._source.system.rules.slice();
            const rule = rules[sourceIndex] as DeepPartial<ItemCastRuleSource> | undefined;
            if (!rule?.data) return;

            foundry.utils.mergeObject(rule.data, changes);

            const update = { _id: this.item.id, "system.rules": rules };

            if (sourceOnly) {
                return update;
            } else {
                return this.actor.updateEmbeddedDocuments("Item", [update]);
            }
        }

        async #setData() {
            const sourceIndex = this.sourceIndex ?? -1;
            if (sourceIndex < 0) return;

            const rules = this.item._source.system.rules.slice();
            const rule = rules[sourceIndex] as DeepPartial<ItemCastRule> | undefined;
            if (!rule) return;

            rule.data ??= {};

            if (rule.data.sourceId !== this.uuid) {
                rule.data = {
                    sourceId: this.uuid,
                    // spellId: foundry.utils.randomID()
                };
            }

            rule.data.entryId ??= foundry.utils.randomID();

            const spell = await fromUuid<SpellPF2e>(this.uuid);
            if (!spell) return;

            const source = spell.toObject();
            source._id = foundry.utils.randomID();
            source.system.location = {
                heightenedLevel: this.rank,
                value: rule.data.entryId,
            };

            rule.data.spell = source as SpellSource & { _id: string };

            if (this.max && (!R.isNumber(rule.data.value) || rule.data.value > this.max)) {
                rule.data.value = this.max;
            } else if (!this.max && R.isNumber(rule.data.value)) {
                delete rule.data.value;
            }

            const update = { _id: this.item.id, "system.rules": rules };
            await this.actor.updateEmbeddedDocuments("Item", [update]);
        }
    }

    interface ItemCastRuleElement extends RuleElement<ItemCastSchema>, ModelPropsFromRESchema<ItemCastSchema> {
        get actor(): CreaturePF2e;
        get item(): PhysicalItemPF2e<CreaturePF2e>;
    }

    return ItemCastRuleElement;
}

interface ItemCastSource extends RuleElementSource, Record<keyof Exclude<ItemCastSchema, RuleElementSchema>, unknown> {}

type BaseItemCastSchema = {
    attribute: fields.StringField<AttributeString, AttributeString, false, true, false>;
    data: fields.ObjectField<ItemCastRuleData>;
    /** if no static dc, we use existing entries */
    dc: fields.NumberField<number, number, false, true, false>;
    max: fields.NumberField<number, number, false, true, false>;
    rank: fields.NumberField<OneToTen, OneToTen, false, false, false>;
    tradition: fields.StringField<MagicTradition, MagicTradition, false, true, false>;
    uuid: fields.StringField<ItemUUID, ItemUUID, true, false, false>;
};

type ItemCastSchema = RuleElementSchema & BaseItemCastSchema;

type ItemCastRuleSource = SourceFromSchema<ItemCastSchema>;
type BaseItemCastRule = ModelPropsFromSchema<BaseItemCastSchema>;
type ItemCastRule = ModelPropsFromSchema<ItemCastSchema>;

type ItemCastRuleData = {
    entryId?: string;
    sourceId?: ItemUUID;
    spellId?: string;
    spell?: SpellSource & { _id: string };
    value?: number;
};

type ItemCastUpdateDataArgs = {
    value?: number;
};

type VirtualSpellData = Prettify<
    Pick<BaseItemCastRule, "attribute" | "dc" | "max" | "tradition"> & {
        item: ConsumablePF2e<CreaturePF2e>;
        parentId: string;
        ruleIndex: number;
        value: number | undefined;
    }
>;

export { createItemCastRuleElement };
export type { VirtualSpellData };
