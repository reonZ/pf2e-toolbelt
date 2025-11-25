import {
    ActorPF2e,
    ActorSheetPF2e,
    ChoiceSetRuleElement,
    ConditionPF2e,
    ConditionSource,
    createCreatureSheetWrapper,
    createEmitable,
    DropCanvasItemDataPF2e,
    EffectPF2e,
    EffectSource,
    isAllyActor,
    ItemPF2e,
    userIsGM,
} from "module-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";

class GivethTool extends ModuleTool<ToolSettings> {
    #givethEmitable = createEmitable(this.key, this.#givethEffect.bind(this));

    #handleDroppedItemWrapper = createCreatureSheetWrapper(
        "MIXED",
        "_handleDroppedItem",
        this.#creatureSheetHandleDroppedItem,
        { context: this }
    );

    get key(): "giveth" {
        return "giveth";
    }

    get settingsSchema(): ToolSettingsList<ToolSettings> {
        return [
            {
                key: "effect",
                type: String,
                choices: ["disabled", "ally", "all"],
                default: "ally",
                scope: "world",
                onChange: () => {
                    this.configurate();
                },
            },
        ];
    }

    get api(): Record<string, any> {
        return {
            canDropEffectOnActor: (item: ItemPF2e, actor: ActorPF2e): boolean => {
                return this.#shouldHandleEffectDrop(item, actor);
            },
        };
    }

    ready(isGM: boolean): void {
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

    #givethEffect({ source, actor }: GiveEffectOptions, userId: string) {
        actor.createEmbeddedDocuments("Item", [source]);
    }

    #shouldHandleEffectDrop(item: ItemPF2e, actor: ActorPF2e): item is EffectPF2e | ConditionPF2e {
        return (
            item.isOfType("condition", "effect") &&
            !actor.isOwner &&
            (this.settings.effect === "all" || isAllyActor(actor))
        );
    }

    async #creatureSheetHandleDroppedItem(
        actorSheet: ActorSheetPF2e<ActorPF2e>,
        wrapped: libWrapper.RegisterCallback,
        event: DragEvent,
        originalItem: ItemPF2e,
        data: DropCanvasItemDataPF2e
    ): Promise<ItemPF2e[]> {
        const actor = actorSheet.actor;

        if (!this.#shouldHandleEffectDrop(originalItem, actor)) {
            return wrapped(event, originalItem, data);
        }

        if (!originalItem.system.rules.some((rule) => rule.key === "ChoiceSet")) {
            this.#givethEmitable.call({
                actor,
                source: originalItem.toObject(),
            });

            return [originalItem];
        }

        const RuleCls = game.pf2e.RuleElements.builtin.ChoiceSet as typeof ChoiceSetRuleElement;
        if (!RuleCls) return [originalItem];

        const ItemCls = getDocumentClass("Item");
        const item = new ItemCls(originalItem.toObject(), { parent: actor });
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

        this.#givethEmitable.call({
            actor,
            source: itemSource,
        });

        return [originalItem];
    }
}

type GiveEffectOptions = {
    source: EffectSource | ConditionSource;
    actor: ActorPF2e;
};

type ToolSettings = {
    effect: "disabled" | "ally" | "all";
};

export { GivethTool };
