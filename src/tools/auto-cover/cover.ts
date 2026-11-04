import {
    ActorPF2e,
    EffectPF2e,
    EffectSource,
    getChoiceSetSelection,
    getItemSourceId,
    Localize,
    localize,
    R,
    signedInteger,
    SYSTEM,
} from "foundry-helpers";

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
    static #localize = localize.sub("autoCover");

    #level: CoverLevel;
    #type: CoverType;

    constructor(type: CoverType, level: CoverLevel = "none") {
        this.#level = level;
        this.#type = type;
    }

    static get localize(): Localize {
        return this.#localize;
    }

    static fromActor(actor: ActorPF2e, isProne: boolean): ToolCover {
        const effects = this.getExistingCovers(actor);
        return this.fromEffects(effects, isProne);
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

    static async getCoverSource(): Promise<EffectSource | undefined> {
        const coverUUID = COVER_UUID();
        return (await fromUuid<EffectPF2e>(coverUUID))?.toObject();
    }

    static getExistingCovers(actor: ActorPF2e): EffectPF2e[] {
        const coverUUID = COVER_UUID();
        return actor.itemTypes.effect.filter((effect) => getItemSourceId(effect) === coverUUID);
    }

    static highestCover(...covers: [ToolCover, ToolCover, ...ToolCover[]]): ToolCover {
        return R.firstBy(covers, [R.prop("enumValue"), "desc"]);
    }

    static getSelectOptions(isProne: boolean, isCheck: boolean) {
        const omits: CoverLevel[] = [];

        if (isCheck) {
            omits.push("lesser");
        }

        if (!isProne) {
            omits.push("greater-prone");
        }

        return R.pipe(
            COVERS,
            R.omit(omits),
            R.keys(),
            R.map((slug) => {
                return { label: this.localize(slug), value: slug };
            }),
        );
    }

    get bonus(): CoverValue {
        const enumValue = this.enumValue;
        return enumValue === 3 ? 4 : enumValue;
    }

    get coverSourceRules() {
        const bonus = this.bonus;
        const level = this.level;

        return [
            {
                choices: [],
                flag: "cover",
                key: "ChoiceSet",
                prompt: "PF2E.SpecificRule.Cover.Prompt",
                selection: { bonus, level },
            },
            { key: "RollOption", option: `self:cover-bonus:${bonus}` },
            { key: "RollOption", option: `self:cover-level:${level}` },
            {
                key: "FlatModifier",
                predicate: [
                    {
                        or: [
                            { and: ["self:condition:prone", "item:ranged"] },
                            { not: "self:cover-level:greater-prone" },
                        ],
                    },
                ],
                selector: "ac",
                type: "circumstance",
                value: bonus,
            },
            {
                key: "FlatModifier",
                predicate: ["area-effect", { not: "self:cover-level:greater-prone" }],
                selector: "reflex",
                type: "circumstance",
                value: bonus,
            },
            {
                key: "FlatModifier",
                predicate: [
                    { or: ["action:hide", "action:sneak", "avoid-detection"] },
                    { not: "self:cover-level:greater-prone" },
                ],
                selector: "stealth",
                type: "circumstance",
                value: bonus,
            },
            {
                key: "FlatModifier",
                predicate: ["action:avoid-notice", { not: "self:cover-level:greater-prone" }],
                selector: "initiative",
                type: "circumstance",
                value: bonus,
            },
        ];
    }

    get enumValue(): CoverEnumValue {
        return COVERS[this.level];
    }

    get hasCover(): boolean {
        return this.enumValue > COVERS.none;
    }

    get level(): CoverLevel {
        return this.#level;
    }

    get levelLabel(): string {
        return ToolCover.localize(this.level);
    }

    get lineColor(): number {
        return this.level !== "none" ? CONFIG.Canvas.dispositionColors.HOSTILE : CONFIG.Canvas.dispositionColors.PARTY;
    }

    get modifier() {
        return new game.pf2e.Modifier({
            domains: ["reflex", "dex-based", "saving-throw", "all"],
            label: this.typeLabel,
            modifier: this.bonus,
            slug: "cover",
            type: "circumstance",
        });
    }

    get signedBonus(): string {
        return signedInteger(this.bonus);
    }

    get type(): CoverType {
        return this.#type;
    }

    get typeLabel(): string {
        return ToolCover.localize(this.type);
    }

    async createSource() {
        const source = await ToolCover.getCoverSource();
        if (!source) return;

        source.name = this.typeLabel;
        source.system.rules = this.coverSourceRules;

        return source;
    }

    equals(other: ToolCover): boolean {
        return this.level === other.level;
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

type CoverLevel = keyof typeof COVERS;
type CoverType = "creature" | "effect" | "overriden" | "wall";
type CoverEnumValue = ValueOf<typeof COVERS>;
type CoverValue = 0 | 1 | 2 | 4;

export { ToolCover };
export type { CoverLevel, CoverType };
