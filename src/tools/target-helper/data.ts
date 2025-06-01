import {
    ActorPF2e,
    ChatMessagePF2e,
    getExtraRollOptions,
    MODULE,
    R,
    TokenDocumentPF2e,
} from "module-helpers";
import { TargetsDataSource, TargetSaveModel, TargetsFlagData, TargetsSaveModel } from ".";

class TargetsData {
    #isGM: boolean;
    #flag: TargetsFlagData;
    #targets: TokenDocumentPF2e[];
    #splashTargets: TokenDocumentPF2e[];

    constructor(flag: TargetsFlagData) {
        this.#isGM = game.user.isGM;
        this.#flag = flag;

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

    get type(): toolbelt.targetHelper.TargetMessageType {
        return this.#flag.type;
    }

    get save(): TargetsSaveModel | undefined {
        return this.#flag.save;
    }

    get itemUUID(): ItemUUID | null {
        return this.#flag.item;
    }

    get isBasicSave(): boolean {
        return !!this.#flag.save?.basic;
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
        return this.#flag.saves;
    }

    get splashTargets(): TokenDocumentPF2e[] {
        return this.#splashTargets;
    }

    get extraRollOptions(): string[] {
        return getExtraRollOptions(this.#flag, this.save?.basic);
    }

    get npcListToRoll(): TokenDocumentPF2e[] {
        const statistic = this.#flag.save?.statistic;
        if (!statistic || !this.#isGM) return [];

        return [...this.targets, ...this.splashTargets].filter((target) => {
            const actor = target.actor;
            return (
                actor?.getStatistic(statistic) &&
                !actor.hasPlayerOwner &&
                !this.#flag.saves[target.id]
            );
        });
    }

    get canRollNPCSaves(): boolean {
        return this.npcListToRoll.length > 0;
    }

    targetSave(id: string): TargetSaveModel | undefined {
        return this.#flag.saves[id];
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

    setFlag(): Promise<ChatMessagePF2e | undefined> {
        return this.#flag.setFlag();
    }

    toJSON(udpates?: DeepPartial<TargetsDataSource>): TargetsDataSource {
        const source = udpates ? this.#flag.clone(udpates) : this.#flag;
        return source.toJSON();
    }
}

MODULE.devExpose({ TargetsData });

export { TargetsData };
