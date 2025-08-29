import {
    ActorPF2e,
    ChatMessagePF2e,
    getExtraRollOptions,
    MODULE,
    R,
    TokenDocumentPF2e,
} from "module-helpers";
import {
    TargetsDataSource,
    TargetSaveModel,
    TargetsFlagData,
    TargetsSaveModel,
    SaveRollData,
} from ".";

class TargetsData {
    #isGM: boolean;
    #flag: TargetsFlagData;
    #targets: TokenDocumentPF2e[];
    #splashTargets: TokenDocumentPF2e[];
    #variantId: string;

    constructor(flag: TargetsFlagData, variantId?: string | null) {
        this.#isGM = game.user.isGM;
        this.#flag = flag;
        this.#variantId = variantId ?? "null";

        const isValidToken = (target: unknown): target is TokenDocumentPF2e => {
            if (!(target instanceof TokenDocument)) return false;

            const actor = target.actor as Maybe<ActorPF2e>;
            return !!actor?.hitPoints?.max;
        };

        this.#targets = R.pipe(
            flag.targets,
            R.map((uuid) => fromUuidSync(uuid)),
            R.filter(isValidToken)
        );

        this.#splashTargets = R.pipe(
            flag.splashTargets,
            R.difference(flag.targets),
            R.map((uuid) => fromUuidSync(uuid)),
            R.filter(isValidToken)
        );
    }

    get author(): ActorUUID | null {
        return this.#flag.author;
    }

    get type(): toolbelt.targetHelper.TargetMessageType {
        return this.#flag.type;
    }

    get variantId(): string {
        return this.#variantId;
    }

    get save(): TargetsSaveModel | undefined {
        return this.#flag.saveVariants[this.variantId];
    }

    get isPrivate(): boolean {
        return !!this.#flag.private;
    }

    get itemUUID(): ItemUUID | null {
        return this.#flag.item;
    }

    get isBasicSave(): boolean {
        return !!this.save?.basic;
    }

    get isAction(): boolean {
        return this.type === "action";
    }

    get hasTargets(): boolean {
        return this.#targets.length > 0;
    }

    get hasSplashTargets(): boolean {
        return this.#splashTargets.length > 0;
    }

    get hasSave(): boolean {
        return !!this.save;
    }

    get hasSplashDamage(): boolean {
        return this.splashIndex > -1;
    }

    get splashIndex(): number {
        return this.#flag.splashIndex;
    }

    get regularIndex(): number {
        return this.splashIndex === 0 ? 1 : 0;
    }

    get targets(): TokenDocumentPF2e[] {
        return this.#targets;
    }

    get saves(): Record<string, TargetSaveModel | undefined> {
        return this.save?.saves ?? {};
    }

    get splashTargets(): TokenDocumentPF2e[] {
        return this.#splashTargets;
    }

    get extraRollOptions(): string[] {
        return getExtraRollOptions(this.#flag, this.save?.basic);
    }

    get npcListToRoll(): TokenDocumentPF2e[] {
        const statistic = this.save?.statistic;
        if (!statistic || !this.#isGM) return [];

        return [...this.targets, ...this.splashTargets].filter((target) => {
            const actor = target.actor;
            return (
                actor?.getStatistic(statistic) && !actor.hasPlayerOwner && !this.saves[target.id]
            );
        });
    }

    get canRollNPCSaves(): boolean {
        return this.npcListToRoll.length > 0;
    }

    targetSave(id: string): TargetSaveModel | undefined {
        return this.saves[id];
    }

    targetApplied(id: string): toolbelt.targetHelper.MessageTargetApplied {
        return this.#flag.applied[id] ?? {};
    }

    update(
        changes: Record<string, JSONValue>,
        options?: Partial<DocumentSourceUpdateContext>
    ): DeepPartial<TargetsDataSource> {
        return this.#flag.updateSource(changes, options);
    }

    updateSaves(
        changes: Record<string, SaveRollData>,
        options?: Partial<DocumentSourceUpdateContext>
    ) {
        return this.update({ [`saveVariants.${this.variantId}.saves`]: changes });
    }

    setFlag(): Promise<ChatMessagePF2e | undefined> {
        return this.#flag.setFlag();
    }

    toJSON(
        udpates?: DeepPartial<TargetsDataSource> & {
            "==saveVariants"?: Record<string, TargetsSaveModel>;
        }
    ): TargetsDataSource {
        const source = udpates ? this.#flag.clone(udpates) : this.#flag;
        return source.toJSON();
    }
}

MODULE.devExpose({ TargetsData });

export { TargetsData };
