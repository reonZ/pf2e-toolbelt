import {
    actorIsPartyMember,
    ActorPF2e,
    ActorSheetPF2e,
    createEmitable,
    createHook,
    createToggleableWrapper,
    DropCanvasItemDataPF2e,
    giveItemToActor,
    htmlQuery,
    isAllyActor,
    ItemPF2e,
    ItemTransferDialog,
    PhysicalItemPF2e,
    userIsGM,
} from "module-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";
import { createTradeMessage, sharedActorTransferItemToActor } from ".";

class GivethTool extends ModuleTool<ToolSettings> {
    #givethEmitable = createEmitable(this.key, (options: GivethOptions, userId: string) => {
        if (options.type === "item") {
            this.#givethItem(options, userId);
        } else {
            this.#givethEffect(options, userId);
        }
    });

    #renderTransferDialogHook = createHook(
        "renderItemTransferDialog",
        this.#onRenderItemTransferDialog.bind(this)
    );

    #transferItemWrapper = sharedActorTransferItemToActor.register(this.#transferItemToActor, {
        context: this,
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
                key: "enabled",
                type: Boolean,
                default: false,
                scope: "world",
                onChange: () => {
                    this.configurate();
                },
            },
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
        const enabled = this.settings.enabled;

        if (userIsGM()) {
            this.#givethEmitable.toggle(enabled);
        } else {
            this.#renderTransferDialogHook.toggle(enabled);
            this.#transferItemWrapper.toggle(enabled);
            this.#handleDroppedItemWrapper.toggle(enabled && this.settings.effect !== "disabled");
        }
    }

    async #givethItem({ item, newStack, quantity, target }: GiveItemOptions, userId: string) {
        const added = await giveItemToActor(item, target, quantity, newStack);

        if (!added) {
            return this.error("error");
        }

        createTradeMessage({
            item: added.item,
            message: this.localizePath("message.content", added.hasContent ? "container" : "item"),
            source: item.actor,
            subtitle: this.localize("message.subtitle"),
            quantity: added.giveQuantity,
            target,
            userId,
        });
    }

    #givethEffect({ data, actor }: GiveEffectOptions, userId: string) {
        const dataTransfer = new DataTransfer();
        dataTransfer.setData("text/plain", JSON.stringify(data));

        const event = new DragEvent("drop", { dataTransfer });
        actor.sheet._onDrop(event);
    }

    #onRenderItemTransferDialog(app: ItemTransferDialog, $html: JQuery) {
        const source = app.item.actor;
        const target = app.options.targetActor;

        if (app.options.isPurchase || !this.#shouldHandleItemTransfer(source, target)) return;

        updateItemTransferDialog($html[0], {
            title: this.localize("dialog.title"),
            prompt: this.localize("dialog.prompt"),
        });
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

    #transferItemToActor(
        actor: ActorPF2e,
        target: ActorPF2e,
        item: PhysicalItemPF2e<ActorPF2e>,
        quantity: number,
        _containerId?: string,
        newStack = true
    ): boolean {
        if (item.quantity >= 1 && this.#shouldHandleItemTransfer(actor, target)) {
            this.#givethEmitable.call({
                type: "item",
                item,
                target,
                quantity,
                newStack,
            });

            return true;
        }

        return false;
    }

    #shouldHandleItemTransfer(source: Maybe<ActorPF2e>, target: Maybe<ActorPF2e>) {
        return (
            source?.isOfType("npc", "character") &&
            target?.isOfType("npc", "character") &&
            (target.hasPlayerOwner || actorIsPartyMember(target)) &&
            source.isOwner &&
            !target.isOwner
        );
    }
}

function updateItemTransferDialog(
    html: HTMLElement,
    { button, prompt, title, noStack }: UpdateItemTransferDialogOptions
) {
    const titleElement = htmlQuery(html, ":scope > header h4");
    if (titleElement) {
        titleElement.innerText = title;
    }

    const buttonElement = htmlQuery(html, "form button");
    if (buttonElement) {
        buttonElement.innerText = button ?? title;
    }

    const questionElement = htmlQuery(html, "form > label");
    if (questionElement) {
        questionElement.innerText = prompt;
    }

    if (noStack) {
        const input = htmlQuery(html, "[name='newStack']");
        input?.previousElementSibling?.remove();
        input?.remove();
    }
}

type UpdateItemTransferDialogOptions = {
    title: string;
    button?: string;
    prompt: string;
    noStack?: boolean;
};

type GiveItemOptions = {
    type: "item";
    item: PhysicalItemPF2e<ActorPF2e>;
    target: ActorPF2e;
    quantity: number;
    newStack: boolean;
};

type GiveEffectOptions = {
    type: "effect";
    data: DropCanvasItemDataPF2e;
    actor: ActorPF2e;
};

type GivethOptions = GiveItemOptions | GiveEffectOptions;

type ToolSettings = {
    enabled: boolean;
    effect: "disabled" | "ally" | "all";
};

export { GivethTool };
