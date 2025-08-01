import {
    ActorPF2e,
    ContainerPF2e,
    createEmitable,
    giveItemToActor,
    PhysicalItemPF2e,
} from "module-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";
import { sharedActorTransferItemToActor } from ".";

class BetterTradeTool extends ModuleTool<ToolSettings> {
    #transferContainerEmitable = createEmitable(
        this.key,
        ({ item, target }: WithContentOptions) => {
            giveItemToActor(item, target);
        }
    );

    #transferItemToActorWrapper = sharedActorTransferItemToActor.register(
        this.#transferItemToActor,
        { context: this, priority: 100 }
    );

    get key(): "betterTrade" {
        return "betterTrade";
    }

    get settingsSchema(): ToolSettingsList<ToolSettings> {
        return [
            {
                key: "withContent",
                type: Boolean,
                default: false,
                scope: "world",
                onChange: (value) => {
                    this.#transferItemToActorWrapper.toggle(value);
                    this.#transferContainerEmitable.toggle(value);
                },
            },
        ];
    }

    init(isGM: boolean): void {
        if (this.settings.withContent) {
            this.#transferItemToActorWrapper.activate();
            this.#transferContainerEmitable.activate();
        }
    }

    #transferItemToActor(
        actor: ActorPF2e,
        target: ActorPF2e,
        item: PhysicalItemPF2e<ActorPF2e>
    ): boolean {
        if (
            item.isOfType("backpack") &&
            item.quantity >= 1 &&
            item.contents.size > 0 &&
            actor.canUserModify(game.user, "update") &&
            target.canUserModify(game.user, "update") &&
            (!actor.isOfType("loot") || !actor.isMerchant) &&
            (!target.isOfType("loot") || !target.isMerchant)
        ) {
            this.#transferContainerEmitable.call({ item, target });
            return true;
        }

        return false;
    }
}

type WithContentOptions = {
    item: ContainerPF2e<ActorPF2e>;
    target: ActorPF2e;
};

type ToolSettings = toolbelt.Settings["betterTrade"];

export { BetterTradeTool };
