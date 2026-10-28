import { ActorPF2e, EffectPF2e, getChoiceSetSelection, getItemSourceId, R, SYSTEM } from "foundry-helpers";

const COVER_UUID = SYSTEM.itemUuid(
    "Compendium.pf2e.other-effects.Item.I9lfZUiCwMiGogVi",
    "Compendium.sf2e.other-effects.Item.I9lfZUiCwMiGogVi",
);

const COVERS = {
    none: 0,
    lesser: 1,
    standard: 2,
    greater: 3,
    "greater-prone": 4,
} as const;

class ToolCover {
    #level: CoverLevel;
    #type: CoverType;

    constructor(type: CoverType, level: CoverLevel) {
        this.#level = level;
        this.#type = type;
    }

    static fromEffects(effects: EffectPF2e[], isProne: boolean): ToolCover {
        const level = R.pipe(
            effects,
            R.map((effect) => getChoiceSetSelection<{ level: CoverLevel }>(effect)?.level ?? "none"),
            R.filter((level) => (isProne ? true : level !== "greater-prone")),
            R.firstBy([(level) => COVERS[level], "desc"]),
        );
        return new this("effect", level ?? "none");
    }

    static fromActor(actor: ActorPF2e, isProne: boolean) {
        const effects = getExistingCovers(actor);
        return this.fromEffects(effects, isProne);
    }

    get level(): CoverLevel {
        return this.#level;
    }

    get type(): CoverType {
        return this.#type;
    }

    get enumValue(): CoverEnumValue {
        return COVERS[this.level];
    }

    get value(): CoverValue {
        const enumValue = this.enumValue;
        return enumValue === 3 ? 4 : enumValue;
    }

    greaterThanLevel(level: CoverLevel) {
        return this.enumValue > COVERS[level];
    }

    greaterThanOrEqualToLevel(level: CoverLevel) {
        return this.enumValue >= COVERS[level];
    }
}

function getExistingCovers(actor: ActorPF2e): EffectPF2e[] {
    const coverUUID = COVER_UUID();
    return actor.itemTypes.effect.filter((effect) => getItemSourceId(effect) === coverUUID);
}

type CoverLevel = keyof typeof COVERS;
type CoverType = "creature" | "effect" | "manual" | "wall";
type CoverEnumValue = ValueOf<typeof COVERS>;
type CoverValue = 0 | 1 | 2 | 4;

export { getExistingCovers, ToolCover };
export type { CoverLevel, CoverType };
