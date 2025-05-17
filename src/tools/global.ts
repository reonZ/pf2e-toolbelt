import {
    ActorPF2e,
    ContainerPF2e,
    createEmitable,
    giveItemToActor,
    PhysicalItemPF2e,
} from "module-helpers";
import { ModuleTool, ToolSettings } from "module-tool";
import { sharedActorTransferItemToActor } from ".";

class GlobalTool extends ModuleTool<Settings> {
    #transferContainerEmitable = createEmitable("global", this.#transferContainer.bind(this));
    #transferItemToActorWrapper = sharedActorTransferItemToActor.register(
        this.#transferItemToActor,
        { context: this, priority: 100 }
    );

    get key(): "global" {
        return "global";
    }

    get settingsSchema(): ToolSettings<Settings> {
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
        ] as const;
    }

    init(isGM: boolean): void {
        if (this.getSetting("withContent")) {
            this.#transferItemToActorWrapper.activate();
            this.#transferContainerEmitable.activate();
        }
    }

    #transferContainer({ item, target }: { item: ContainerPF2e<ActorPF2e>; target: ActorPF2e }) {
        giveItemToActor(item, target);
    }

    #transferItemToActor(
        actor: ActorPF2e,
        target: ActorPF2e,
        item: PhysicalItemPF2e<ActorPF2e>
    ): boolean {
        const isLoot = actor.isOfType("loot");
        const targetIsLoot = target.isOfType("loot");

        if (
            item.isOfType("backpack") &&
            item.quantity >= 1 &&
            item.contents.size > 0 &&
            actor.canUserModify(game.user, "update") &&
            target.canUserModify(game.user, "update") &&
            (!isLoot || !actor.isMerchant) &&
            (!targetIsLoot || !target.isMerchant)
        ) {
            this.#transferContainerEmitable.call({ item, target });
            return true;
        }

        return false;
    }
}

type Settings = {
    withContent: boolean;
};

export { GlobalTool };
