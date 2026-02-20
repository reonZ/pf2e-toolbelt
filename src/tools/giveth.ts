import {
    ActorPF2e,
    ChoiceSetRuleElement,
    ConditionPF2e,
    ConditionSource,
    createCreatureSheetWrapper,
    createEmitable,
    CreaturePF2e,
    CreatureSheetPF2e,
    DropCanvasItemData,
    EffectPF2e,
    EffectSource,
    EffectTrait,
    isAllyActor,
    isInstanceOf,
    ItemPF2e,
    userIsGM,
} from "foundry-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";

const EFFECT_SETTING = ["disabled", "ally", "all"] as const;

class GivethTool extends ModuleTool<ToolSettings> {
    #givethEmitable = createEmitable(this.key, this.#givethEffect.bind(this));

    #handleDroppedItemWrapper = createCreatureSheetWrapper(
        "MIXED",
        "_handleDroppedItem",
        this.#creatureSheetHandleDroppedItem,
        { context: this },
    );

    get key(): "giveth" {
        return "giveth";
    }

    get settingsSchema(): ToolSettingsList<ToolSettings> {
        return [
            {
                key: "effect",
                type: String,
                choices: EFFECT_SETTING,
                default: "disabled",
                scope: "world",
                onChange: () => {
                    this.configurate();
                },
            },
        ];
    }

    get api(): Record<string, any> {
        return {
            givethEffect: this.#handleGiveth.bind(this),
            canDropEffectOnActor: this.#shouldHandleEffectDrop.bind(this),
        };
    }

    ready(): void {
        this._configurate();
    }

    _configurate(): void {
        const effects = this.settings.effect !== "disabled";

        if (userIsGM()) {
            this.#givethEmitable.toggle(effects);
        } else {
            this.#handleDroppedItemWrapper.toggle(effects);
        }
    }

    #givethEffect({ actor, data, source }: GiveEffectOptions, _userId: string): any {
        /**
         * https://github.com/foundryvtt/pf2e/blob/1465f7190b2b8454094c50fa6d06e9902e0a3c41/src/module/actor/sheet/base.ts#L1224
         */
        if (source.type === "condition") {
            const value = data.value;
            if (typeof value === "number" && source.system.value.isValued) {
                source.system.value.value = value;
            }

            return actor.increaseCondition(source.system.slug, { value });
        }

        /**
         * https://github.com/foundryvtt/pf2e/blob/1465f7190b2b8454094c50fa6d06e9902e0a3c41/src/module/actor/sheet/base.ts#L1238
         */
        const { level, value, context } = data;
        if (typeof level === "number" && level >= 0) {
            source.system.level.value = Math.floor(level);
        }
        if (source.type === "effect" && source.system.badge?.type === "counter" && typeof value === "number") {
            source.system.badge.value = value;
        }
        source.system.context = context ?? null;
        const originItem = fromUuidSync(context?.origin.item ?? "");
        if (source.system.traits?.value.length === 0 && isInstanceOf(originItem, "SpellPF2e")) {
            const spellTraits: string[] = originItem.system.traits.value;
            const effectTraits = spellTraits.filter((t): t is EffectTrait => t in CONFIG.PF2E.effectTraits);
            source.system.traits.value.push(...effectTraits);
        }

        actor.sheet["_onDropItemCreate"](new Item.implementation(source).clone().toObject());
    }

    #shouldHandleEffectDrop(item: ItemPF2e, actor: ActorPF2e): item is EffectPF2e | ConditionPF2e {
        return (
            item.isOfType("condition", "effect") &&
            !actor.isOwner &&
            (this.settings.effect === "all" || isAllyActor(actor))
        );
    }

    async #handleGiveth(targetActor: CreaturePF2e, originalItem: EffectPF2e | ConditionPF2e, data: DropCanvasItemData) {
        if (originalItem.isOfType("condition") || !originalItem.system.rules.some((rule) => rule.key === "ChoiceSet")) {
            return this.#givethEmitable.call({
                actor: targetActor,
                data,
                source: originalItem.toObject(),
            });
        }

        const RuleCls = game.pf2e.RuleElements.builtin.ChoiceSet as typeof ChoiceSetRuleElement;
        if (!RuleCls) return;

        const ItemCls = getDocumentClass("Item");
        const item = new ItemCls(originalItem.toObject(), { parent: targetActor }) as ItemPF2e<CreaturePF2e>;
        const itemSource = item._source as EffectSource | ConditionSource;
        const itemUpdates: EmbeddedDocumentUpdateData[] = [];

        for (const [sourceIndex, source] of item.system.rules.entries()) {
            if (source.key !== "ChoiceSet") continue;

            try {
                const rule = new RuleCls(source, { parent: item, sourceIndex });
                const ruleSource = itemSource.system.rules[sourceIndex];

                await rule.preCreate({
                    ruleSource,
                    itemSource,
                    tempItems: [],
                    itemUpdates,
                    operation: {},
                    pendingItems: [],
                });
            } catch (error) {}
        }

        return this.#givethEmitable.call({
            actor: targetActor,
            data,
            source: itemSource,
        });
    }

    async #creatureSheetHandleDroppedItem(
        actorSheet: CreatureSheetPF2e<CreaturePF2e>,
        wrapped: libWrapper.RegisterCallback,
        event: DragEvent,
        originalItem: ItemPF2e,
        data: DropCanvasItemData,
    ): Promise<ItemPF2e[]> {
        const targetActor = actorSheet.actor;

        if (!this.#shouldHandleEffectDrop(originalItem, targetActor)) {
            return wrapped(event, originalItem, data);
        }

        await this.#handleGiveth(targetActor, originalItem, data);

        return [originalItem];
    }
}

type GiveEffectOptions = {
    actor: CreaturePF2e;
    data: DropCanvasItemData;
    source: EffectSource | ConditionSource;
};

type ToolSettings = {
    effect: (typeof EFFECT_SETTING)[number];
};

export { GivethTool };
