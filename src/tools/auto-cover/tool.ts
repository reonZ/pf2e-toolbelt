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
    toggleHooksAndWrappers,
    TokenPF2e,
    ZeroToFour,
} from "foundry-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";
import {
    COVER_VALUES,
    CoverHighlightRenderer,
    CoverValue,
    drawDebugLine,
    getRectEdges,
    lineIntersect,
    RectEdge,
    SIZES,
    spreadToToken,
    tokenToSpread,
} from ".";

const CREATURE_SETTINGS = ["disabled", "cross", "zero", "ten", "twenty"] as const;

const WALL_INTERSECTIONS_SETTING = [
    "disabled",
    "center-center",
    "center-spread",
    "center-corner",
    "corner-center",
] as const;

const COVER_UUID = SYSTEM.uuid(
    "Compendium.pf2e.other-effects.Item.I9lfZUiCwMiGogVi",
    "Compendium.sf2e.other-effects.Item.I9lfZUiCwMiGogVi",
);

class AutoCoverTool extends ModuleTool<ToolSettings> {
    #wrappers = [
        createToggleWrapper("WRAPPER", "game.pf2e.Check.roll", this.#checkRoll, { context: this }),
        createToggleWrapper(
            "WRAPPER",
            "CONFIG.Token.objectClass.prototype._refreshVisibility",
            this.#tokenRefreshVisibility,
            { context: this },
        ),
        createToggleWrapper("WRAPPER", "CONFIG.Token.objectClass.prototype._destroy", this.#tokenDestroy, {
            context: this,
        }),
    ];

    get key(): "autoCover" {
        return "autoCover";
    }

    get settingsSchema(): ToolSettingsList<ToolSettings> {
        return [
            {
                key: "wall",
                type: String,
                default: "disabled",
                scope: "world",
                choices: WALL_INTERSECTIONS_SETTING,
                onChange: () => {
                    this.configurate();
                },
            },
            {
                key: "creature",
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
        const enabled = this.settings.creature !== "disabled" || this.settings.wall !== "disabled";
        toggleHooksAndWrappers(this.#wrappers, enabled);
    }

    init(): void {
        this._configurate();
    }

    getCoverHighlight(token: TokenPF2e, fallback: true): CoverHighlightRenderer;
    getCoverHighlight(token: TokenPF2e, fallback: boolean): CoverHighlightRenderer | undefined;
    getCoverHighlight(token: TokenPF2e, fallback: boolean) {
        const current = this.getInMemory<CoverHighlightRenderer>(token, "coverHighlight");
        return fallback ? (current ?? new CoverHighlightRenderer(token, this)) : current;
    }

    #tokenRefreshVisibility(token: TokenPF2e, wrapped: libWrapper.RegisterCallback) {
        wrapped();

        const coverHighlight = this.getCoverHighlight(token, true);
        coverHighlight.draw();
        this.setInMemory(token, "coverHighlight", coverHighlight);
    }

    #tokenDestroy(token: TokenPF2e, wrapped: libWrapper.RegisterCallback) {
        wrapped();

        const coverHighlight = this.getCoverHighlight(token, false);
        coverHighlight?.destroy();
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

        const cover = this.calculateCover(originToken, targetToken);

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

    calculateCover(origin: TokenPF2e, target: TokenPF2e): { type: "wall" | "creature"; value: CoverValue } {
        const debug = MODULE.isDebug;

        if (debug) {
            this.clearDebug();
        }

        if (this.intersectsWithWall(origin, target, debug)) {
            return { type: "wall", value: "standard" };
        }

        const cover = this.calculateCreaturesCover(origin, target, debug);
        return { type: "creature", value: cover };
    }

    intersectsWithWall(origin: TokenPF2e, target: TokenPF2e, debug: boolean = false): boolean {
        const setting = this.settings.wall;

        switch (setting) {
            case "center-center":
                return lineIntersect(origin.center, target.center, debug);
            case "center-spread":
                return tokenToSpread(origin, target, "spread", debug);
            case "center-corner":
                return tokenToSpread(origin, target, "corner", debug);
            case "corner-center":
                return spreadToToken(origin, "corner", target, debug);
            // case "corner-spread":
            //     return spreadToSpread(origin, "corner", target, "spread", debug);
            // case "corner-corner":
            //     return spreadToSpread(origin, "corner", target, "corner", debug);
            default:
                return false;
        }
    }

    calculateCreaturesCover(originToken: TokenPF2e, targetToken: TokenPF2e, debug: boolean = false): CoverValue {
        const scene = originToken.scene;
        const setting = this.settings.creature;
        const originActor = originToken.actor;
        const targetActor = targetToken.actor;

        if (!scene || setting === "disabled" || !originActor || !targetActor) {
            return "none";
        }

        const origin = originToken.center;
        const target = targetToken.center;
        const originSize = SIZES[originActor.size];
        const targetSize = SIZES[targetActor.size];
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

    clearDebug() {
        canvas.controls.debug.clear();
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

type ToolSettings = {
    creature: (typeof CREATURE_SETTINGS)[number];
    dead: boolean;
    prone: boolean;
    wall: (typeof WALL_INTERSECTIONS_SETTING)[number];
};

export { AutoCoverTool };
