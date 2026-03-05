import {
    ActorPF2e,
    Check,
    CheckCheckContext,
    CheckModifier,
    CheckRoll,
    CheckRollCallback,
    createToggleWrapper,
    EffectPF2e,
    getChoiceSetSelection,
    getFirstActiveToken,
    getItemSourceId,
    MODULE,
    R,
    Rolled,
    SYSTEM,
    TokenPF2e,
    ZeroToFour,
} from "foundry-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";

const CREATURE_SETTINGS = ["disabled", "cross", "zero", "ten", "twenty"] as const;

const WALL_INTERSECTIONS_SETTING = [
    "disabled",
    "center-center",
    "center-spread",
    "center-corner",
    "corner-center",
    "corner-spread",
    "corner-corner",
] as const;

const COVER_UUID = SYSTEM.uuid(
    "Compendium.pf2e.other-effects.Item.I9lfZUiCwMiGogVi",
    "Compendium.sf2e.other-effects.Item.I9lfZUiCwMiGogVi",
);

const RECT_CORNERS = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0.5, y: 0.5 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
];

const RECT_SPREAD = [
    { x: 0.25, y: 0.25 },
    { x: 0.75, y: 0.25 },
    { x: 0.5, y: 0.5 },
    { x: 0.25, y: 0.75 },
    { x: 0.75, y: 0.75 },
];

const SIZES = {
    tiny: 0,
    sm: 1,
    med: 2,
    lg: 3,
    huge: 4,
    grg: 5,
};

const COVER_VALUES = {
    none: 0,
    lesser: 1,
    standard: 2,
    greater: 3,
    "greater-prone": 4,
} as const;

class AutoCoverTool extends ModuleTool<ToolSettings> {
    #checkRollWrapper = createToggleWrapper("WRAPPER", "game.pf2e.Check.roll", this.#checkRoll, { context: this });

    get key(): "autoCover" {
        return "autoCover";
    }

    get settingsSchema(): ToolSettingsList<ToolSettings> {
        return [
            {
                key: "walls",
                type: String,
                default: "disabled",
                scope: "world",
                choices: WALL_INTERSECTIONS_SETTING,
                onChange: () => {
                    this.configurate();
                },
            },
            {
                key: "creatures",
                type: String,
                default: "disabled",
                scope: "world",
                choices: CREATURE_SETTINGS,
                onChange: () => {
                    this.configurate();
                },
            },
            {
                key: "dead",
                type: Boolean,
                default: true,
                scope: "world",
            },
            {
                key: "prone",
                type: Boolean,
                default: true,
                scope: "world",
            },
        ];
    }

    _configurate(): void {
        this.#checkRollWrapper.toggle(this.settings.creatures !== "disabled" || this.settings.walls !== "disabled");
    }

    init(): void {
        this._configurate();
    }

    async #checkRoll(
        _check: Check,
        wrapped: libWrapper.RegisterCallback,
        ...args: [check: CheckModifier, context?: CheckCheckContext, event?: Event | null, callback?: CheckRollCallback]
    ): Promise<Rolled<CheckRoll> | null> {
        const context = args[1];

        if (
            !context?.target ||
            context.isReroll ||
            !context.createMessage ||
            context.type !== "attack-roll" ||
            (R.isNumber(context.target.distance) && context.target.distance <= 5)
        ) {
            return wrapped(...args);
        }

        const originActor = context.origin?.actor ?? context.actor;
        const targetActor = context.target.actor;

        if (!originActor || !targetActor || originActor.isOfType("hazard")) {
            return wrapped(...args);
        }

        const originToken = (context.origin?.token ?? context.token ?? getFirstActiveToken(originActor))?.object;
        const targetToken = (context.target.token ?? getFirstActiveToken(targetActor))?.object;

        if (!originToken || !targetToken) {
            return wrapped(...args);
        }

        if (!R.isNumber(context.target.distance) && originToken.distanceTo(targetToken) <= 5) {
            return wrapped(...args);
        }

        const coverUUID = COVER_UUID();
        const allExisting = R.map(targetActor.itemTypes.effect, (effect): ZeroToFour => {
            if (getItemSourceId(effect) !== coverUUID) return 0;
            const level = getChoiceSetSelection<{ level: CoverValue }>(effect)?.level;
            return COVER_VALUES[level ?? "none"] as ZeroToFour;
        });
        const existing = R.firstBy(allExisting, [R.identity(), "desc"]) ?? 0;

        if (existing >= COVER_VALUES.standard) {
            return wrapped(...args);
        }

        const cover = this.calculateCover(originToken as TokenWithActor, targetToken as TokenWithActor);

        if (COVER_VALUES[cover.value] > existing) {
            const items = foundry.utils.deepClone(targetActor._source.items);
            const source = (await fromUuid<EffectPF2e>(coverUUID))?.toObject();

            if (!source) {
                return wrapped(...args);
            }

            source.name = this.localize(cover.type);
            source.system.rules = coverSourceRules(cover.value);

            items.push(source);

            context.target.actor = targetActor.clone({ items }, { keepId: true });

            if (context.dc?.slug) {
                const statistic = context.target.actor.getStatistic(context.dc.slug)?.dc;

                if (statistic) {
                    context.dc.value = statistic.value;
                    context.dc.statistic = statistic;
                }
            }
        }

        return wrapped(...args);
    }

    calculateCover(origin: TokenWithActor, target: TokenWithActor): { type: "wall" | "creature"; value: CoverValue } {
        const debug = MODULE.isDebug;

        if (debug) {
            clearDebug();
        }

        if (this.intersectsWithWall(origin, target, debug)) {
            return { type: "wall", value: "standard" };
        }

        const cover = this.calculateCreaturesCover(origin, target, debug);
        return { type: "creature", value: cover };
    }

    intersectsWithWall(origin: TokenWithActor, target: TokenWithActor, debug: boolean = false): boolean {
        const setting = this.settings.walls;

        switch (setting) {
            case "center-center":
                return lineIntersect(origin.center, target.center, debug);
            case "center-spread":
                return tokenToSpread(origin, target, RECT_SPREAD, debug);
            case "center-corner":
                return tokenToSpread(origin, target, RECT_CORNERS, debug);
            case "corner-center":
                return spreadToToken(origin, RECT_CORNERS, target, debug);
            case "corner-spread":
                return spreadToSpread(origin, RECT_CORNERS, target, RECT_SPREAD, debug);
            case "corner-corner":
                return spreadToSpread(origin, RECT_CORNERS, target, RECT_CORNERS, debug);
            default:
                return false;
        }
    }

    calculateCreaturesCover(
        originToken: TokenWithActor,
        targetToken: TokenWithActor,
        debug: boolean = false,
    ): CoverValue {
        const scene = originToken.scene;
        const setting = this.settings.creatures;

        if (!scene || setting === "disabled") {
            return "none";
        }

        const origin = originToken.center;
        const target = targetToken.center;
        const originSize = SIZES[originToken.actor.size];
        const targetSize = SIZES[originToken.actor.size];
        const canHaveExtraLarges = originSize < SIZES.huge && targetSize < SIZES.huge;
        const skipDead = this.settings.dead;
        const skipProne = this.settings.prone;
        const margin = setting === "ten" ? 0.1 : setting === "twenty" ? 0.2 : 0;

        if (debug) {
            drawDebugLine(origin, target, "blue");
        }

        const intersectsEdge = (edge: RectEdge): boolean => {
            const intersects = foundry.utils.lineSegmentIntersects(origin, target, edge.A, edge.B);

            if (debug) {
                drawDebugLine(edge.A, edge.B, intersects ? "red" : "green");
            }

            return intersects;
        };

        const intersectsWith = (token: TokenPF2e) => {
            const edges = getRectEdges(token.bounds, margin);

            if (setting === "cross") {
                return (
                    (intersectsEdge(edges.top) && intersectsEdge(edges.bottom)) ||
                    (intersectsEdge(edges.left) && intersectsEdge(edges.right))
                );
            } else {
                return Object.values(edges).some((edge) => intersectsEdge(edge));
            }
        };

        const isExtraLarge = (actor: ActorPF2e) => {
            const size = SIZES[actor.size];
            return size - originSize >= 2 && size - targetSize >= 2;
        };

        let cover: CoverValue = "none";
        let extraLargeCount = 0;

        const sceneTokens = R.pipe(
            scene.tokens.contents,
            R.map((tokenDocument): { extraLarge: boolean; token: TokenPF2e } | undefined => {
                const token = tokenDocument.object;
                const actor = token?.actor;

                if (!token || !actor || tokenDocument.hidden) return;
                if (token === originToken || token === targetToken) return;
                if (skipDead && !actor.hitPoints?.value) return;
                if (skipProne && actor.getCondition("prone")) return;

                const extraLarge = canHaveExtraLarges && isExtraLarge(actor);

                if (extraLarge) {
                    extraLargeCount++;
                }

                return { extraLarge, token };
            }),
            R.filter(R.isTruthy),
        );

        for (const { extraLarge, token } of sceneTokens) {
            if (extraLarge) {
                extraLargeCount--;
            }

            if (!intersectsWith(token)) continue;

            if (extraLarge) {
                return "standard";
            }

            if (extraLargeCount < 1) {
                return "lesser";
            }

            cover = "lesser";
        }

        return cover;
    }
}

function coverSourceRules(level: CoverValue) {
    const bonus = COVER_VALUES[level];

    return [
        { key: "RollOption", option: `self:cover-bonus:${bonus}` },
        { key: "RollOption", option: `self:cover-level:${level}` },
        {
            key: "FlatModifier",
            predicate: [
                { or: [{ and: ["self:condition:prone", "item:ranged"] }, { not: "self:cover-level:greater-prone" }] },
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

function getRectPoint(point: Point, rect: Rectangle): Point {
    return { x: rect.x + rect.width * point.x, y: rect.y + rect.height * point.y };
}

function getRectEdges(rect: Rectangle, margin: number): RectEdges {
    const opposite = 1 - margin;
    return {
        top: {
            A: getRectPoint({ x: margin, y: margin }, rect),
            B: getRectPoint({ x: opposite, y: margin }, rect),
        },
        right: {
            A: getRectPoint({ x: opposite, y: margin }, rect),
            B: getRectPoint({ x: opposite, y: opposite }, rect),
        },
        bottom: {
            A: getRectPoint({ x: opposite, y: opposite }, rect),
            B: getRectPoint({ x: margin, y: opposite }, rect),
        },
        left: {
            A: getRectPoint({ x: margin, y: opposite }, rect),
            B: getRectPoint({ x: margin, y: margin }, rect),
        },
    };
}

function* tokenSpread(token: TokenPF2e, spread: Point[]): Generator<Point, void, unknown> {
    const rect = token.bounds;

    for (const point of spread) {
        yield getRectPoint(point, rect);
    }
}

function tokenToSpread(origin: TokenPF2e, target: TokenPF2e, spread: Point[], debug: boolean): boolean {
    const originCenter = origin.center;

    if (target.actor?.size === "tiny") {
        return lineIntersect(originCenter, target.center, debug);
    }

    for (const point of tokenSpread(target, spread)) {
        if (lineIntersect(originCenter, point, debug)) return true;
    }

    return false;
}

function spreadToToken(origin: TokenPF2e, spread: Point[], target: TokenPF2e, debug: boolean): boolean {
    const targetCenter = target.center;

    if (origin.actor?.size === "tiny") {
        return lineIntersect(origin.center, targetCenter, debug);
    }

    for (const point of tokenSpread(origin, spread)) {
        if (lineIntersect(point, targetCenter, debug)) return true;
    }

    return false;
}

function spreadToSpread(
    origin: TokenPF2e,
    originSpread: Point[],
    target: TokenPF2e,
    targetSpread: Point[],
    debug: boolean,
): boolean {
    if (origin.actor?.size === "tiny") {
        return tokenToSpread(origin, target, targetSpread, debug);
    }

    if (target.actor?.size === "tiny") {
        return spreadToToken(origin, originSpread, target, debug);
    }

    for (const originPoint of tokenSpread(origin, originSpread)) {
        for (const targetPoint of tokenSpread(target, targetSpread)) {
            if (lineIntersect(originPoint, targetPoint, debug)) return true;
        }
    }

    return false;
}

function lineIntersect(origin: Point, target: Point, debug: boolean): boolean {
    const intersects = CONFIG.Canvas.polygonBackends.move.testCollision(origin, target, { type: "move", mode: "any" });

    if (debug) {
        drawDebugLine(origin, target, intersects ? "red" : "green");
    }

    return intersects;
}

function drawDebugLine(origin: Point, target: Point, color: "blue" | "green" | "red") {
    const hex = color === "blue" ? 0x0066cc : color === "red" ? 0xff0000 : 0x16a103;
    canvas.controls.debug.lineStyle(4, hex).moveTo(origin.x, origin.y).lineTo(target.x, target.y);
}

function clearDebug() {
    canvas.controls.debug.clear();
}

type ToolSettings = {
    creatures: (typeof CREATURE_SETTINGS)[number];
    dead: boolean;
    prone: boolean;
    walls: (typeof WALL_INTERSECTIONS_SETTING)[number];
};

type RectEdge = { A: Point; B: Point };
type RectEdges = Record<"top" | "right" | "bottom" | "left", RectEdge>;

type CoverValue = keyof typeof COVER_VALUES;

type TokenWithActor = TokenPF2e & { actor: ActorPF2e };

export { AutoCoverTool };
