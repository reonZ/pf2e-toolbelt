import { ActorPF2e, EffectPF2e, getChoiceSetSelection, getItemSourceId, MODULE, R, SYSTEM } from "foundry-helpers";

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

    constructor(type: CoverType, level: CoverLevel = "none") {
        this.#level = level;
        this.#type = type;
    }

    static fromEffects(effects: EffectPF2e[], isProne: boolean): ToolCover {
        const allLevels = R.map(
            effects,
            (effect) => getChoiceSetSelection<{ level: CoverLevel }>(effect)?.level ?? "none",
        );

        const levels = isProne
            ? R.filter(allLevels, (level) => (isProne ? true : level !== "greater-prone"))
            : allLevels;

        const level = R.firstBy(levels, [(level) => COVERS[level], "desc"]);
        return new ToolCover("effect", level ?? "none");
    }

    static fromActor(actor: ActorPF2e, isProne: boolean): ToolCover {
        const effects = getExistingCovers(actor);
        return this.fromEffects(effects, isProne);
    }

    static highestCover(...covers: [ToolCover, ToolCover, ...ToolCover[]]): ToolCover {
        return R.firstBy(covers, [R.prop("enumValue"), "desc"]);
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

    equalsLevel(level: CoverLevel): boolean {
        return this.level === level;
    }

    greaterThan(other: ToolCover): boolean {
        return this.enumValue > other.enumValue;
    }

    greaterThanLevel(level: CoverLevel): boolean {
        return this.enumValue > COVERS[level];
    }

    greaterThanOrEqualToLevel(level: CoverLevel): boolean {
        return this.enumValue >= COVERS[level];
    }

    updateLevel(level: CoverLevel): this {
        this.#level = level;
        return this;
    }
}

function getExistingCovers(actor: ActorPF2e): EffectPF2e[] {
    const coverUUID = COVER_UUID();
    return actor.itemTypes.effect.filter((effect) => getItemSourceId(effect) === coverUUID);
}

MODULE.debugExpose("Cover", ToolCover);

type CoverLevel = keyof typeof COVERS;
type CoverType = "creature" | "effect" | "manual" | "wall";
type CoverEnumValue = ValueOf<typeof COVERS>;
type CoverValue = 0 | 1 | 2 | 4;

export { getExistingCovers, ToolCover };
export type { CoverLevel, CoverType };
