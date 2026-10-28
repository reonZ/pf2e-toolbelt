import {
    Check,
    CheckCheckContext,
    CheckModifier,
    CheckModifiersDialog,
    CheckRoll,
    CheckRollCallback,
    ClockwiseSweepPolygonConfig,
    createHTMLElement,
    createToggleHook,
    createToggleWrapper,
    EffectPF2e,
    getFirstActiveToken,
    htmlQuery,
    ItemSourcePF2e,
    MODULE,
    R,
    Rolled,
    ScenePF2e,
    signedInteger,
    toggleHooksAndWrappers,
    TokenDocumentPF2e,
    TokenPF2e,
    ZeroToFour,
} from "foundry-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";
import { drawDebug } from "tools";
import {
    CoverHighlightRenderer,
    CoverLevel,
    getExistingCovers,
    getSideOfPointFromLine,
    lineIntersectTriangle,
    SpreadValuesGenerator,
    spreadValuesGenerator,
    ToolCover,
    Vector,
} from ".";

const SETTING_ENABLED = ["disabled", "manual", "enabled"] as const;

const WALL_LEVEL = ["lesser", "standard", "greater"] as const satisfies CoverLevel[];
const WALL_MODE = ["move", "none", "normal"] as const;
const WALL_FLAG_LEVEL = ["default", ...WALL_LEVEL] as const;
const WALL_FLAG_MODE = ["default", "none", "normal"] as const;

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
        createToggleWrapper(
            "WRAPPER",
            "foundry.applications.sheets.WallConfig.prototype._renderHTML",
            this.#wallConfigRenderHTML,
            { context: this },
        ),
    ];

    #onRenderCheckModifierDialog = createToggleHook(
        "renderCheckModifiersDialog",
        this.#onRenderCheckModifiersDialog.bind(this),
    );

    get key(): "autoCover" {
        return "autoCover";
    }

    get settingsSchema(): ToolSettingsList<ToolSettings> {
        const enabledChoices = R.fromKeys(SETTING_ENABLED, (key) => this.settingLocalize.path("enabled.choices", key));

        return [
            {
                key: "wallEnabled",
                type: String,
                scope: "world",
                default: "disabled",
                choices: enabledChoices,
                hint: this.settingLocalize.path("enabled.hint"),
                onChange: () => {
                    this.configurate();
                },
            },
            {
                key: "wallDefaultMode",
                type: String,
                scope: "world",
                default: "move",
                choices: WALL_MODE,
            },
            {
                key: "wallDefaultLevel",
                type: String,
                scope: "world",
                default: "standard",
                choices: R.fromKeys(WALL_LEVEL, (key) => this.localize(key)),
            },
            ...R.map(["wallOrigin", "wallTarget"] as const, (key) => {
                return {
                    key,
                    type: Number,
                    scope: "world",
                    default: 0,
                    range: {
                        min: 0,
                        max: 0.5,
                        step: 0.05,
                    },
                    hint: this.settingLocalize.path("spread.hint"),
                } as const;
            }),
            {
                key: "creatureEnabled",
                type: String,
                scope: "world",
                default: "disabled",
                choices: SETTING_ENABLED,
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
        const creature = this.settings.creatureEnabled;
        const wall = this.settings.wallEnabled;

        toggleHooksAndWrappers(this.#wrappers, creature === "enabled" || wall === "enabled");
        this.#onRenderCheckModifierDialog.toggle(creature !== "disabled" || wall !== "disabled");
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

    isTargetProne(context: CheckCheckContext): boolean {
        return Array.isArray(context.options)
            ? context.options.includes("item:ranged") && context.options.includes("target:condition:prone")
            : !!(context.options?.has("item:ranged") && context.options?.has("target:condition:prone"));
    }

    getCoverBonus(level: CoverLevel): ZeroToFour {
        const rawBonus = COVER_VALUES[level];
        return rawBonus === 3 ? 4 : rawBonus;
    }

    getWallLevelFlag(wall: WallDocument): WallFlagLevel {
        const flag = this.getFlag<string>(wall, "level");
        return R.isIncludedIn(flag, WALL_FLAG_LEVEL) ? flag : "default";
    }

    getWallLevel(wall: WallDocument): WallLevel {
        const level = this.getWallLevelFlag(wall);
        return level === "default" ? this.settings.wallDefaultLevel : level;
    }

    getWallModeFlag(wall: WallDocument): WallFlagMode {
        const flag = this.getFlag<string>(wall, "mode");
        return R.isIncludedIn(flag, WALL_FLAG_MODE) ? flag : "default";
    }

    getWallMode(wall: WallDocument): WallMode {
        const mode = this.getWallModeFlag(wall);
        return mode === "default" ? this.settings.wallDefaultMode : mode;
    }

    calculateCover(
        origin: TokenDocumentPF2e,
        target: TokenDocumentPF2e,
        { context, debug }: { context?: CheckCheckContext; debug?: boolean } = {},
    ): ToolCover {
        if (debug) {
            canvas.controls.debug.clear();
        }

        const wall = this.calculateWallCover(origin, target, debug);
        if (wall.greaterThanOrEqualToLevel("standard")) {
            return wall; // wall cover is greater than what a creature cover could ever be
        }

        const distance = context?.target?.distance ?? (target?.object && origin.object?.distanceTo(target?.object));
        if (distance ?? 0 <= 5) {
            return wall; // we avoid calculating creature cover with adjacent tokens
        }

        const cover = this.calculateCreaturesCover(origin, target, debug);
        return { type: "creature", level: cover };
    }

    calculateWallCover(originToken: TokenDocumentPF2e, targetToken: TokenDocumentPF2e, debug?: boolean): ToolCover {
        const collision = this.testWallCollision(originToken, targetToken, {
            debug,
            originSpread: this.settings.wallOrigin,
            targetSpread: this.settings.wallTarget,
        });
        return new ToolCover("wall", collision?.level ?? "none");
    }

    calculateCreaturesCover(
        originToken: TokenDocumentPF2e,
        targetToken: TokenDocumentPF2e,
        debug?: boolean,
    ): ToolCover {
        //         const scene = originToken.scene;
        //         const setting = this.settings.creature;
        //         const originActor = originToken.actor;
        //         const targetActor = targetToken.actor;
        //
        //         if (!scene || setting === "disabled" || !originActor || !targetActor) {
        //             return "none";
        //         }
        //
        //         const origin = originToken.center;
        //         const target = targetToken.center;
        //
        //         if (debug) {
        //             drawDebug("blue", origin, target);
        //         }
        //
        //         let cover: CoverLevel = "none";
        //         const skipDead = this.settings.dead;
        //         const skipProne = this.settings.prone;
        //         const originSize = SIZES[originActor.size];
        //         const targetSize = SIZES[targetActor.size];
        //         const margin = setting === "ten" ? 0.1 : setting === "twenty" ? 0.2 : 0;
        //         const canHaveExtraLarges = originSize < SIZES.huge && targetSize < SIZES.huge;
        //
        //         const isExtraLarge = (actor: ActorPF2e) => {
        //             const size = SIZES[actor.size];
        //             return size - originSize >= 2 && size - targetSize >= 2;
        //         };
        //
        //         const intersectsEdge = (edge: RectEdge): boolean => {
        //             const intersects = foundry.utils.lineSegmentIntersects(origin, target, edge.A, edge.B);
        //
        //             if (debug) {
        //                 drawDebug(intersects ? "red" : "green", edge.A, edge.B);
        //             }
        //
        //             return intersects;
        //         };
        //
        //         const intersectsWith = (token: TokenPF2e) => {
        //             const edges = getRectEdges(token.bounds, margin);
        //
        //             if (setting === "cross") {
        //                 return (
        //                     (intersectsEdge(edges.top) && intersectsEdge(edges.bottom)) ||
        //                     (intersectsEdge(edges.left) && intersectsEdge(edges.right))
        //                 );
        //             } else {
        //                 return Object.values(edges).some((edge) => intersectsEdge(edge));
        //             }
        //         };
        //
        //         for (const tokenDocument of scene.tokens) {
        //             const token = tokenDocument.object;
        //             const actor = token?.actor;
        //
        //             if (!token || !actor || tokenDocument.hidden) continue;
        //             if (token === originToken || token === targetToken) continue;
        //             if (skipDead && !actor.hitPoints?.value) continue;
        //             if (skipProne && actor.getCondition("prone")) continue;
        //
        //             const rollOptions = actor.rollOptions.all;
        //             const isAllyCharacter = actor.type === "character" && actor.isAllyOf(originActor);
        //
        //             if (isAllyCharacter && rollOptions["armor:rune:property:aim-aiding"] && !rollOptions["armor:uninvested"])
        //                 continue; // we handle the 'Aim-Aiding' armor rune (make sure the armor is not uninvested)
        //
        //             const extraLarge = canHaveExtraLarges && isExtraLarge(actor);
        //
        //             // we handle the 'Phalanx Formation' feat (it only excludes lesser-cover)
        //             if (!extraLarge && isAllyCharacter && rollOptions["feat:phalanx-formation"]) continue;
        //             // we don't need to check intersections on that token as it won't give more than what we already have
        //             if (!extraLarge && cover === "lesser") continue;
        //             // no intersection
        //             if (!intersectsWith(token)) continue;
        //             // we can't have extra large check so this is as much as we will ever get
        //             if (!canHaveExtraLarges) return "lesser";
        //             // we can never get anything beyond 'standard' so we check out now
        //             if (extraLarge) return "standard";
        //             // we can still have an extra large check later on so we have to keep going
        //             cover = "lesser";
        //         }
        //
        //         return cover;
    }

    testWallCollision(
        origin: TokenDocumentPF2e,
        target: TokenDocumentPF2e,
        { debug, originSpread = 0, targetSpread = 0 }: TestWallCollisionOptions = {},
    ): WallCollision | undefined {
        const scene = origin.scene ?? canvas.scene;
        if (!scene) return;

        const boundaryWidth = target.x - origin.x;
        const boundaryHeight = target.y - origin.y;

        // we have nothing to test, the points are on top of each other
        if (boundaryWidth === 0 && boundaryHeight === 0) return;

        const boundaryShape = new PIXI.Rectangle(origin.x, origin.y, boundaryWidth, boundaryHeight);
        const config: ClockwiseSweepPolygonConfig = {
            type: "move",
            boundaryShapes: [boundaryShape.normalize()],
        };

        const poly = new CONFIG.Canvas.polygonBackends.move();
        poly.initialize(origin, config);
        poly["_identifyEdges"]();

        const generator = spreadValuesGenerator(origin, target, originSpread, targetSpread);
        const collision = this.#testWallCollision(scene, generator, poly.edges);

        if (collision && debug) {
            this.#drawWallDebug(origin, collision);
        }

        return collision;
    }

    #testWallCollision(
        scene: ScenePF2e,
        generator: SpreadValuesGenerator,
        edges: Set<foundry.canvas.geometry.edges.Edge>,
    ): WallCollision | undefined {
        const { distance, size } = scene.grid;

        for (const edge of edges) {
            const wall = edge.object;
            if (!(wall instanceof CONFIG.Wall.documentClass)) continue;

            const mode = this.getWallMode(wall);
            // this edge doesn't block cover so we skip
            if (mode === "none" || (mode === "move" && edge.isLimited("move"))) continue;

            const levels = wall.levels.map((id) => scene.levels.get(id)).filter(R.isTruthy);
            // we retrieve the unique ranges for this edge
            const ranges = R.pipe(
                [...(levels.size ? levels : scene.levels)],
                R.map((level) => [level.elevation.bottom, level.elevation.top] as const),
                R.uniqueWith((a, b) => a[0] === b[0] && a[1] === b[1]),
            );

            for (const range of ranges) {
                // we can't check intersections with Infinity numbers
                const bottom = range[0] === -Infinity ? Number.MIN_SAFE_INTEGER : (range[0] / distance) * size;
                const top = range[1] === Infinity ? Number.MAX_SAFE_INTEGER : (range[1] / distance) * size;

                const r0 = Vector.fromData(edge.a, bottom);
                const r1 = Vector.fromData(edge.b, bottom);
                const r2 = Vector.fromData(edge.b, top);
                const r3 = Vector.fromData(edge.a, top);

                const triangles = [
                    [r0, r1, r3],
                    [r3, r2, r1],
                ] as const;

                for (const [v0, v1, v2] of triangles) {
                    for (const [O, T, D] of generator) {
                        const point = lineIntersectTriangle(O, D, v0, v1, v2);
                        if (!point) continue;

                        return {
                            edge: [r0, r1],
                            level: this.getWallLevel(wall),
                            range: [bottom, top],
                            ray: [O, T],
                            point,
                            triangle: [v0, v1, v2],
                        };
                    }
                }
            }
        }
    }

    #drawWallDebug(origin: TokenDocumentPF2e, collision: WallCollision) {
        const { edge, point: p0, range, ray, triangle } = collision;
        const [bottom, top] = range;
        const [v0, v1, v2] = triangle;
        const [e0, e1] = edge;
        const [O, T] = ray;

        // no point in displaying infinite sized walls
        if (bottom !== Number.MIN_SAFE_INTEGER && top !== Number.MAX_SAFE_INTEGER) {
            const u = Vector.fromData(v1).subtract(v0);
            // we scale horizontally if the edge isn't of an appropriate length
            const m = u.vector2d.magnitude;
            const scalarH = Math.max(m, 200) / m;
            const scaleH = (p: Vector) => {
                if (scalarH === 1 || p.equals2d(e0)) return p;
                const su = p.subtract(e0);
                return su.multiplyBy(scalarH).subtract(su).add(p);
            };
            // we scale vertically if the wall's height is inappropriate
            const depth = top - bottom;
            const scalarV = Math.clamp(depth, 200, Math.max(800, m * scalarH)) / depth;
            // we project the points onto our triangle section
            const side = getSideOfPointFromLine(v0, v1, origin.center);
            const proj = u.rotate90(side === 1).normalize;
            const [t0, t1, t2, p1] = R.map([v0, v1, v2, p0], (p) => {
                const s = scaleH(p);
                return p.z === bottom ? s : proj.multiplyBy((p.z - bottom) * scalarV).add(s);
            });

            drawDebug("blue", t0, t1, t2, true); // projected triangle section
            drawDebug("blue", scaleH(p0), p1); // projected z-axis line
            drawDebug("blue", p1, 4); // projected z-axis circle
        }

        drawDebug("red", e0, e1); // edge that was intersected with
        drawDebug("red", O, T); // line between tokens
    }

    async #wallConfigRenderHTML(
        app: WallConfig,
        wrapped: libWrapper.RegisterCallback,
        context: fa.ApplicationRenderContext,
        options: fa.ApplicationRenderOptions,
    ) {
        const result = (await wrapped(context, options)) as { body: HTMLElement };
        const fieldSet = createHTMLElement("fieldset", {
            content: createHTMLElement("legend", { content: MODULE.name }),
        });

        const modeGroup = foundry.applications.fields.createFormGroup({
            input: foundry.applications.fields.createSelectInput({
                id: `${app}-toolbelt-mode`,
                name: `flags.${MODULE.id}.${this.key}.mode`,
                options: WALL_FLAG_MODE.map((value) => {
                    const label =
                        value === "default"
                            ? this.localize("default", {
                                  entry: this.settingLocalize("wallDefaultMode.choices", this.settings.wallDefaultMode),
                              })
                            : this.settingLocalize("wallDefaultMode.choices", value);
                    return { value, label };
                }),
                value: this.getWallModeFlag(app.document),
            }),
            label: this.localize("mode"),
        });

        const levelGroup = foundry.applications.fields.createFormGroup({
            input: foundry.applications.fields.createSelectInput({
                id: `${app}-toolbelt-level`,
                name: `flags.${MODULE.id}.${this.key}.level`,
                options: WALL_FLAG_LEVEL.map((value) => {
                    const label =
                        value === "default"
                            ? this.localize("default", {
                                  entry: this.localize(this.settings.wallDefaultLevel),
                              })
                            : this.localize(value);
                    return { value, label };
                }),
                value: this.getWallLevelFlag(app.document),
            }),
            label: this.localize("level"),
        });

        fieldSet.append(modeGroup, levelGroup);

        htmlQuery(result.body, "fieldset")?.after(fieldSet);

        return result;
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

        if (!context?.target || context.isReroll || !context.createMessage || context.type !== "attack-roll") {
            return wrapped(...args);
        }

        const originActor = context.origin?.actor ?? context.actor;
        const targetActor = context.target.actor;

        if (!originActor || !targetActor || originActor.isOfType("hazard")) {
            return wrapped(...args);
        }

        const origin = context.origin?.token ?? context.token ?? getFirstActiveToken(originActor);
        const target = context.target.token ?? getFirstActiveToken(targetActor);

        if (!origin || !target || !origin.scene || origin.scene !== target.scene || origin.id === target.id) {
            return wrapped(...args);
        }

        const targetIsProne = this.isTargetProne(context);
        const existing = ToolCover.fromActor(targetActor, targetIsProne);
        if (existing.greaterThanLevel("standard")) {
            return wrapped(...args); // we can't have anything greater than the currently existing effect
        }

        const debug = MODULE.isDebug;
        if (debug) {
            canvas.controls.debug.clear();
        }

        const cover = this.calculateCover(origin, target, { context, debug: MODULE.isDebug });
        //         if (cover.type === "creature" && (context.target.distance ?? originToken.distanceTo(targetToken)) <= 5) {
        //             return wrapped(...args);
        //         }
        //
        //         if (COVER_VALUES[cover.level] > existing.value) {
        //             const items = foundry.utils.deepClone(targetActor._source.items);
        //             await this.#addCoverSourceToContext(context, items, cover.level, this.localize(cover.type));
        //         }

        return wrapped(...args);
    }

    #onRenderCheckModifiersDialog(dialog: CheckModifiersDialog, $html: JQuery) {
        const context = dialog.context;
        if (!context?.target || context.isReroll || !context.createMessage || context.type !== "attack-roll") return;

        const originActor = context.origin?.actor ?? context.actor;
        const targetActor = context.target.actor;
        if (!originActor || !targetActor || originActor.isOfType("hazard")) return;

        const targetIsProne = this.isTargetProne(context);
        const coverEffects = getExistingCovers(targetActor);
        const current = this.getHighestCoverSelection(coverEffects, targetIsProne);

        const html = $html[0];
        const separator = document.createElement("hr");

        const options = R.pipe(
            targetIsProne ? COVER_VALUES : R.omit(COVER_VALUES, ["greater-prone"]),
            R.keys(),
            R.map((slug) => {
                return { label: this.localize(slug), value: slug };
            }),
        );

        const select = foundry.applications.fields.createSelectInput({
            name: "override-cover",
            options,
            value: current.level,
        });

        const getDisplayedBonus = (level: CoverLevel): string => {
            const bonus = this.getCoverBonus(level);
            return signedInteger(bonus);
        };

        const bonusSpan = createHTMLElement("span", {
            content: getDisplayedBonus(current.level),
        });

        const row = createHTMLElement("div", {
            classes: ["override-cover"],
            content: `<label>${this.localize("override")}</label>`,
        });

        row.append(bonusSpan, select);

        htmlQuery(html, ".add-modifier-panel")?.after(separator, row);

        let cover = current.level;

        select.addEventListener("change", () => {
            cover = select.value as CoverLevel;
            bonusSpan.innerText = getDisplayedBonus(cover);
        });

        htmlQuery(html, `button[type="submit"]`)?.addEventListener(
            "click",
            async (event) => {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();

                if (cover !== current.level) {
                    const ids = coverEffects.map((effect) => effect.id);
                    const allItems = foundry.utils.deepClone(targetActor._source.items);
                    const items = ids.length ? allItems.filter((item) => !R.isIncludedIn(item._id, ids)) : allItems;

                    await this.#addCoverSourceToContext(context, items, cover, this.localize("overriden"));
                }

                dialog.resolve(true);
                dialog.isResolved = true;
                dialog.close();
            },
            { capture: true },
        );

        dialog.setPosition();
    }

    async #addCoverSourceToContext(
        context: CheckCheckContext,
        items: ItemSourcePF2e[],
        level: CoverLevel,
        sourceName: string,
    ) {
        const coverUUID = COVER_UUID();
        const source = (await fromUuid<EffectPF2e>(coverUUID))?.toObject();
        if (!source) return;

        source.name = sourceName;
        source.system.rules = this.#coverSourceRules(level);

        items.push(source);

        context.target!.actor = context.target!.actor!.clone({ items }, { keepId: true });

        if (context.dc?.slug) {
            const statistic = context.target!.actor.getStatistic(context.dc.slug)?.dc;

            if (statistic) {
                context.dc.value = statistic.value;
                context.dc.statistic = statistic;
            }
        }
    }

    #coverSourceRules(level: CoverLevel) {
        const bonus = this.getCoverBonus(level);

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
}

type ToolSettings = {
    creatureEnabled: SettingEnabledType;
    dead: boolean;
    prone: boolean;
    wallDefaultMode: (typeof WALL_MODE)[number];
    wallDefaultLevel: (typeof WALL_LEVEL)[number];
    wallEnabled: SettingEnabledType;
    wallOrigin: number;
    wallTarget: number;
};

type WallCollision = {
    edge: [Vector, Vector];
    level: WallLevel;
    range: [number, number];
    ray: [Vector, Vector];
    point: Vector;
    triangle: [Vector, Vector, Vector];
};

type WallConfig = fa.api.DocumentSheetV2<fa.api.DocumentSheetConfiguration<WallDocument>>;

type SettingEnabledType = (typeof SETTING_ENABLED)[number];

type WallFlagLevel = (typeof WALL_FLAG_LEVEL)[number];
type WallLevel = (typeof WALL_LEVEL)[number];

type WallFlagMode = (typeof WALL_FLAG_MODE)[number];
type WallMode = (typeof WALL_MODE)[number];

type TestWallCollisionOptions = {
    debug?: boolean;
    originSpread?: number;
    targetSpread?: number;
};

export { AutoCoverTool };
