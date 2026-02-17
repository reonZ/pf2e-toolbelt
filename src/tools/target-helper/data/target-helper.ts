import {
    ActorPF2e,
    ChatMessagePF2e,
    getDocumentFromUUID,
    getExtraRollOptions,
    ItemPF2e,
    TokenDocumentPF2e,
} from "foundry-helpers";
import { SaveVariant, TargetSaveInstance, TargetsData, TargetsDataSource } from ".";

class TargetHelper {
    #data: TargetsData;
    #isGM: boolean;
    #variantId: string;

    constructor(data: TargetsData, variantId: string = "null") {
        this.#data = data;
        this.#isGM = game.user.isGM;
        this.#variantId = variantId;
    }

    get variantId(): string {
        return this.#variantId;
    }

    get type(): toolbelt.targetHelper.TargetMessageType {
        return this.#data.type;
    }

    get author(): foundry.utils.DocumentUUID | null {
        return this.#data.author;
    }

    get targets(): TokenDocumentPF2e[] {
        return this.#data.targets;
    }

    get splashTargets(): TokenDocumentPF2e[] {
        return this.#data.splashTargets;
    }

    get hasTargets(): boolean {
        return this.targets.length > 0 || this.splashTargets.length > 0;
    }

    get saveVariant(): SaveVariant {
        return this.#data.saveVariants[this.#variantId];
    }

    get itemUUID(): foundry.utils.DocumentUUID | null {
        return this.#data.item;
    }

    get isPrivate(): boolean {
        return !!this.#data.private;
    }

    get isBasic(): boolean {
        return !!this.saveVariant?.basic;
    }

    get isAction(): boolean {
        return this.type === "action";
    }

    get extraRollOptions(): string[] {
        return getExtraRollOptions(this.#data, this.isBasic);
    }

    get npcListToRoll(): TokenDocumentPF2e[] {
        const statistic = this.saveVariant?.statistic;
        if (!statistic || !this.#isGM) return [];

        return [...this.targets, ...this.splashTargets].filter((target) => {
            const actor = target.actor;
            return actor?.getStatistic(statistic) && !actor.hasPlayerOwner && !this.saveVariant.saves[target.id];
        });
    }

    get canRollNPCSaves(): boolean {
        return this.npcListToRoll.length > 0;
    }

    async getItem(message: ChatMessagePF2e): Promise<ItemPF2e<ActorPF2e> | null> {
        return (await getDocumentFromUUID("Item", this.itemUUID)) ?? message.item;
    }

    targetSave(id: string): TargetSaveInstance | undefined {
        return this.saveVariant.saves[id];
    }

    encode(changes?: DeepPartial<TargetsDataSource>): TargetsDataSource {
        return this.#data.encode(changes);
    }
}

export { TargetHelper };
