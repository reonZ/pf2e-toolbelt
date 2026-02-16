import { SaveVariant, TargetSaveInstance, TargetsData, TargetsDataSource } from ".";

class TargetHelper {
    #data: TargetsData;
    #variantId: string;

    constructor(data: TargetsData, variantId: string = "null") {
        this.#data = data;
        this.#variantId = variantId;
    }

    get author(): foundry.utils.DocumentUUID | null {
        return this.#data.author;
    }

    get targets() {
        return this.#data.targets;
    }

    get splashTargets() {
        return this.#data.splashTargets;
    }

    get hasTargets(): boolean {
        return this.targets.length > 0 || this.splashTargets.length > 0;
    }

    get saveVariant(): SaveVariant {
        return this.#data.saveVariants[this.#variantId];
    }

    targetSave(id: string): TargetSaveInstance | undefined {
        return this.saveVariant.saves[id];
    }

    encode(changes?: DeepPartial<TargetsDataSource>): TargetsDataSource {
        return this.#data.encode(changes);
    }
}

export { TargetHelper };
