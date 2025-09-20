import {
    ActorPF2e,
    ActorSheetPF2e,
    createEmitable,
    createToggleableWrapper,
    DropCanvasItemDataPF2e,
    isAllyActor,
    ItemPF2e,
    userIsGM,
} from "module-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";

class GivethTool extends ModuleTool<ToolSettings> {
    #givethEmitable = createEmitable(this.key, (options: GivethOptions, userId: string) => {
        if (options.type === "effect") {
            this.#givethEffect(options, userId);
        }
    });

    #handleDroppedItemWrapper = createToggleableWrapper(
        "MIXED",
        [
            "CONFIG.Actor.sheetClasses.character['pf2e.CharacterSheetPF2e'].cls.prototype._handleDroppedItem",
            "CONFIG.Actor.sheetClasses.npc['pf2e.NPCSheetPF2e'].cls.prototype._handleDroppedItem",
            "CONFIG.Actor.sheetClasses.familiar['pf2e.FamiliarSheetPF2e'].cls.prototype._handleDroppedItem",
        ],
        this.#actorSheetHandleDroppedItem,
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

    #givethEffect({ data, actor }: GiveEffectOptions, userId: string) {
        const dataTransfer = new DataTransfer();
        dataTransfer.setData("text/plain", JSON.stringify(data));

        const event = new DragEvent("drop", { dataTransfer });
        actor.sheet._onDrop(event);
    }

    #shouldHandleEffectDrop(item: ItemPF2e, actor: ActorPF2e): boolean {
        return (
            item.isOfType("condition", "effect") &&
            !actor.isOwner &&
            (this.settings.effect === "all" || isAllyActor(actor))
        );
    }

    async #actorSheetHandleDroppedItem(
        actorSheet: ActorSheetPF2e<ActorPF2e>,
        wrapped: libWrapper.RegisterCallback,
        event: DragEvent,
        item: ItemPF2e,
        data: DropCanvasItemDataPF2e
    ): Promise<ItemPF2e[]> {
        const actor = actorSheet.actor;

        if (this.#shouldHandleEffectDrop(item, actor)) {
            this.#givethEmitable.call({
                type: "effect",
                actor,
                data,
            });
            return [item];
        }

        return wrapped(event, item, data);
    }
}

type GiveEffectOptions = {
    type: "effect";
    data: DropCanvasItemDataPF2e;
    actor: ActorPF2e;
};

type GivethOptions = GiveEffectOptions;

type ToolSettings = {
    effect: "disabled" | "ally" | "all";
};

export { GivethTool };
