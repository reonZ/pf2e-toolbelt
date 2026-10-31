import {
    ActorPF2e,
    Check,
    CheckCheckContext,
    CheckModifier,
    CheckModifiersDialog,
    CheckRoll,
    CheckRollCallback,
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
    Wall,
    ZeroToFour,
} from "foundry-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";
import { clearDebug, drawDebug } from "tools";
import {
    CoverHighlightRenderer,
    CoverLevel,
    createBoundaryFromTokens,
    createRectangleTriangles,
    createSpreadRaysGenerator,
    createTokenSpreadGenerator,
    getExistingCovers,
    getSideOfPointFromLine,
    lineIntersectTriangle,
    SpreadRaysGenerator,
    TOKEN_FACES,
    ToolCover,
    Vector,
} from ".";

const SIZES = {
    tiny: 0,
    sm: 1,
    med: 2,
    lg: 3,
    huge: 4,
    grg: 5,
} as const;

const SETTING_ENABLED = ["disabled", "manual", "enabled"] as const;

const CREATURE_MODES = ["any", "opposite"] as const;

const WALL_LEVELS = ["lesser", "standard", "greater"] as const satisfies CoverLevel[];
const WALL_MODES = ["move", "none", "normal"] as const;
const WALL_FLAG_LEVELS = ["default", ...WALL_LEVELS] as const;
const WALL_FLAG_MODES = ["default", "none", "normal"] as const;

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
        const spreadSetting = (key: "creatureOrigin" | "creatureTarget" | "wallOrigin" | "wallTarget") => {
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
        };

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
            spreadSetting("wallOrigin"),
            spreadSetting("wallTarget"),
            {
                key: "wallDefaultMode",
                type: String,
                scope: "world",
                default: "move",
                choices: WALL_MODES,
            },
            {
                key: "wallDefaultLevel",
                type: String,
                scope: "world",
                default: "standard",
                choices: R.fromKeys(WALL_LEVELS, (key) => this.localize(key)),
            },
            {
                key: "creatureEnabled",
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
                key: "creatureMode",
                type: String,
                scope: "world",
                default: "any",
                choices: CREATURE_MODES,
            },
            {
                key: "creatureSide",
                type: Number,
                scope: "world",
                default: 1,
                range: {
                    min: 0.75,
                    max: 1,
                    step: 0.05,
                },
            },
            spreadSetting("creatureOrigin"),
            spreadSetting("creatureTarget"),
            {
                key: "creatureDead",
                type: Boolean,
                default: true,
                scope: "world",
            },
            {
                key: "creatureProne",
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

    getCoverBonus(level: CoverLevel): ZeroToFour {
        const rawBonus = COVER_VALUES[level];
        return rawBonus === 3 ? 4 : rawBonus;
    }

    getWallLevelFlag(wall: WallDocument): WallFlagLevel {
        const flag = this.getFlag<string>(wall, "level");
        return R.isIncludedIn(flag, WALL_FLAG_LEVELS) ? flag : "default";
    }

    getWallLevel(wall: WallDocument): WallLevel {
        const level = this.getWallLevelFlag(wall);
        return level === "default" ? this.settings.wallDefaultLevel : level;
    }

    getWallModeFlag(wall: WallDocument): WallFlagMode {
        const flag = this.getFlag<string>(wall, "mode");
        return R.isIncludedIn(flag, WALL_FLAG_MODES) ? flag : "default";
    }

    getWallMode(wall: WallDocument): WallMode {
        const mode = this.getWallModeFlag(wall);
        return mode === "default" ? this.settings.wallDefaultMode : mode;
    }

    calculateCreatureCover(
        origin: TokenDocumentPF2e,
        target: TokenDocumentPF2e,
        context: CheckCheckContext = {},
        debug: boolean = false,
    ) {
        const result = this.testCreaturesCover(origin, target, {
            context,
            debug,
            mode: this.settings.creatureMode,
            originSpread: this.settings.creatureOrigin,
            sideScale: this.settings.creatureSide,
            skipDead: this.settings.creatureDead,
            skipProne: this.settings.creatureProne,
            targetSpread: this.settings.creatureTarget,
        } satisfies Required<TestCreaturesCoverOptions>);
        // return new ToolCover("wall", collision?.level ?? "none");
    }

    testCreaturesCover(
        origin: TokenDocumentPF2e,
        target: TokenDocumentPF2e,
        {
            context,
            debug,
            mode = "any",
            originSpread = 0,
            sideScale = 1,
            skipDead,
            skipProne,
            targetSpread = 0,
        }: TestCreaturesCoverOptions = {},
    ) {
        const distance = context?.target?.distance ?? (target?.object && origin.object?.distanceTo(target?.object));
        if (distance ?? 0 <= 5) return; // we avoid calculating creature cover with adjacent target

        const originActor = origin.actor;
        const targetActor = target.actor;
        if (!originActor || !targetActor) return;

        const boundaryShape = createBoundaryFromTokens(origin, target);
        if (boundaryShape.width === 0 && boundaryShape.height === 0) return;

        const tokens = canvas.tokens.quadtree.getObjects(boundaryShape);
        if (!tokens.size) return;

        const originSize = SIZES[originActor.size];
        const targetSize = SIZES[targetActor.size];

        const canHaveExtraLarges = originSize < SIZES.huge && targetSize < SIZES.huge;
        const isExtraLarge = (actor: ActorPF2e) => {
            const size = SIZES[actor.size];
            return size - originSize >= 2 && size - targetSize >= 2;
        };

        let cover: CoverLevel = "none";
        let collision: {} | undefined;
        const raysGenerator = createSpreadRaysGenerator(origin, target, originSpread, targetSpread);

        for (const { document: token } of tokens) {
            const actor = token?.actor;

            if (!actor || token.hidden) continue;
            if (token === origin || token === target) continue;
            if (skipDead && !actor.hitPoints?.value) continue;
            if (skipProne && actor.getCondition("prone")) continue;

            const rollOptions = actor.rollOptions.all;
            const isAllyCharacter = actor.type === "character" && actor.isAllyOf(originActor);

            if (isAllyCharacter && rollOptions["armor:rune:property:aim-aiding"] && !rollOptions["armor:uninvested"])
                continue; // we handle the 'Aim-Aiding' armor rune (make sure the armor is not uninvested)

            const extraLarge = canHaveExtraLarges && isExtraLarge(actor);

            // we handle the 'Phalanx Formation' feat (it only excludes lesser-cover)
            if (!extraLarge && isAllyCharacter && rollOptions["feat:phalanx-formation"]) continue;
            // we don't need to check intersections on that token as it won't give more than what we already have
            if (!extraLarge && cover === "lesser") continue;

            const _collision = this.#testCreatureCollision(token, raysGenerator, sideScale, mode);
            if (!_collision) continue; // no intersection

            // we can't have extra large check so this is as much as we will ever get
            if (!canHaveExtraLarges) {
                collision = _collision;
                cover = "lesser";
                break;
            }

            // we can never get anything beyond 'standard' so we check out now
            if (extraLarge) {
                collision = _collision;
                cover = "standard";
                break;
            }

            // we can still have extra large checks later on so we have to keep going
            cover = "lesser";
            collision ??= _collision;
        }

        return { cover, collision };
    }

    #testCreatureCollision(
        token: TokenDocumentPF2e,
        raysGenerator: SpreadRaysGenerator,
        sideScale: number,
        mode: CreatureMode,
    ): CreatureCollision | undefined {
        const spreadValue = Math.clamp(sideScale, 0.75, 1) - 0.5;
        const spread = createTokenSpreadGenerator(token, spreadValue);
        // we preemptively eleminate tokens that would never intersect rays
        if (spread.ceil < raysGenerator.minZ || spread.floor > raysGenerator.maxZ) return;

        const points: Vector[] = spread.toArray();
        const eliminate = raysGenerator.eliminate;
        let collision: CreatureCollision | undefined;

        face: for (let faceIndex = 0; faceIndex < TOKEN_FACES.length; faceIndex++) {
            const rectangle = R.map(TOKEN_FACES[faceIndex], (pointIndex) => points[pointIndex]);
            const [t0, t1] = createRectangleTriangles(rectangle);

            for (const [O, T, D] of raysGenerator()) {
                const point = lineIntersectTriangle(O, D, t0) ?? lineIntersectTriangle(O, D, t1);

                // we eliminate the face as we have at least one non-intersecting ray
                if (eliminate && !point) continue face;

                // we cache the first collision
                if (point) {
                    collision ??= {
                        intersects: [],
                        range: [spread.floor, spread.ceil],
                        rays: [],
                        rectangle,
                    };
                    collision.intersects.push(point);
                    collision.rays.push([O, T]);
                }

                // we aren't eliminating so we have an unique collision
                if (collision && !eliminate) {
                    return collision;
                }
            }

            // we are eliminating and all rays have collision
            if (eliminate && collision) {
                return collision;
            }
        }
    }

    calculateWallCover(origin: TokenDocumentPF2e, target: TokenDocumentPF2e, debug: boolean = false): ToolCover {
        const collision = this.testWallsCollisions(origin, target, {
            debug,
            originSpread: this.settings.wallOrigin,
            targetSpread: this.settings.wallTarget,
        } satisfies Required<TestWallCollisionOptions>);
        return new ToolCover("wall", collision?.level ?? "none");
    }

    testWallsCollisions(
        origin: TokenDocumentPF2e,
        target: TokenDocumentPF2e,
        { debug, originSpread = 0, targetSpread = 0 }: TestWallCollisionOptions = {},
    ): WallCollision | undefined {
        const scene = origin.scene;
        if (!scene || scene !== canvas.scene || !canvas.walls.quadtree) return;

        const boundaryShape = createBoundaryFromTokens(origin, target);
        if (boundaryShape.width === 0 && boundaryShape.height === 0) return;

        const walls = canvas.walls.quadtree.getObjects(boundaryShape).filter(({ document: wall, edge }) => {
            const mode = this.getWallMode(wall);
            // this wall doesn't block cover so we skip
            if (mode === "none" || (mode === "move" && edge.isLimited("move"))) return false;

            const side = edge.orientPoint(origin.center);
            // point collinear or wrong direction from wall
            if (!side || (edge.direction && side === edge.direction)) return false;

            return true;
        });

        if (!walls.size) return;

        const raysGenerator = createSpreadRaysGenerator(origin, target, originSpread, targetSpread);
        const collision = this.#testWallCollisions(scene, raysGenerator, walls);

        if (collision && debug) {
            this.#drawWallDebug(origin, collision);
        }

        return collision;
    }

    #testWallCollisions(
        scene: ScenePF2e,
        raysGenerator: SpreadRaysGenerator,
        walls: Set<Wall>,
    ): WallCollision | undefined {
        const { distance, size } = scene.grid;
        const eliminate = raysGenerator.eliminate;

        for (const { document: wall, edge } of walls) {
            const levels = wall.levels.map((id) => scene.levels.get(id)).filter(R.isTruthy);
            // we retrieve the unique ranges for this edge
            const ranges = R.pipe(
                [...(levels.size ? levels : scene.levels)],
                R.map((level) => [level.elevation.bottom, level.elevation.top] as const),
                R.uniqueWith((a, b) => a[0] === b[0] && a[1] === b[1]),
            );

            range: for (const range of ranges) {
                // we can't check intersections with Infinity numbers
                const bottom = range[0] === -Infinity ? Number.MIN_SAFE_INTEGER : (range[0] / distance) * size;
                const top = range[1] === Infinity ? Number.MAX_SAFE_INTEGER : (range[1] / distance) * size;
                // we preemptively eleminate ranges that would never intersect rays
                if (top < raysGenerator.minZ || bottom > raysGenerator.maxZ) continue;

                const rectangle = [
                    Vector.fromData(edge.a, bottom), // r0
                    Vector.fromData(edge.b, bottom), // r1
                    Vector.fromData(edge.b, top), // r2
                    Vector.fromData(edge.a, top), // r3
                ] as const;

                const [t0, t1] = createRectangleTriangles(rectangle);

                let collision: WallCollision | undefined;
                for (const [O, T, D] of raysGenerator()) {
                    const point = lineIntersectTriangle(O, D, t0) ?? lineIntersectTriangle(O, D, t1);

                    // we eliminate the edge as we have at least one non-intersecting ray
                    if (eliminate && !point) continue range;

                    // we cache the collision
                    if (point) {
                        collision ??= {
                            intersects: [],
                            level: this.getWallLevel(wall),
                            range: [bottom, top],
                            rays: [],
                            rectangle,
                        };
                        collision.intersects.push(point);
                        collision.rays.push([O, T]);
                    }

                    // we aren't eliminating so we have an unique collision
                    if (collision && !eliminate) {
                        return collision;
                    }
                }

                // we are eliminating and all rays have collision
                if (eliminate && collision) {
                    return collision;
                }
            }
        }
    }

    #drawWallDebug(origin: TokenDocumentPF2e, collision: CreatureCollision | WallCollision) {
        const { intersects, range, rays, rectangle } = collision;
        const [bottom, top] = range;
        const [e0, e1] = rectangle;

        for (const [O, T] of rays) {
            drawDebug("red", O, T); // line between tokens
        }

        // no point in displaying infinite sized walls
        if (bottom !== Number.MIN_SAFE_INTEGER && top !== Number.MAX_SAFE_INTEGER) {
            const u = Vector.fromData(e1).subtract(e0);
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
            const side = getSideOfPointFromLine(e0, e1, origin.center);
            const proj = u.rotate90(side === 1).normalize;
            const projectPoint = (p: Vector) => {
                const s = scaleH(p);
                return p.z === bottom ? s : proj.multiplyBy((p.z - bottom) * scalarV).add(s);
            };
            const [r0, r1, r2, r3] = R.map(rectangle, projectPoint);
            drawDebug("blue", r1, r0, r3, r2, r1, r3); // projected triangle section
            for (const p0 of intersects) {
                const p1 = projectPoint(p0);
                drawDebug("blue", scaleH(p0), p1); // projected z-axis line
                drawDebug("blue", p1, 4); // projected z-axis circle
            }
        }

        drawDebug("red", e0, e1); // edge that was intersected with
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
                options: WALL_FLAG_MODES.map((value) => {
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
                options: WALL_FLAG_LEVELS.map((value) => {
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

        if (
            !origin ||
            !target ||
            !origin.scene ||
            origin.scene !== canvas.scene ||
            origin.scene !== target.scene ||
            origin.id === target.id
        ) {
            return wrapped(...args);
        }

        const targetIsProne = isTargetProne(context);
        const exist = ToolCover.fromActor(targetActor, targetIsProne);
        if (exist.greaterThanLevel("standard")) {
            return wrapped(...args); // we can't have anything greater than the currently existing effect
        }

        const debug = MODULE.isDebug;
        if (debug) {
            canvas.controls.debug.clear();
        }

        const cover = this.#calculateCover(origin, target, { context, debug: MODULE.isDebug });
        if (cover.greaterThan(exist)) {
            //             const items = foundry.utils.deepClone(targetActor._source.items);
            //             await this.#addCoverSourceToContext(context, items, cover.level, this.localize(cover.type));
        }

        return wrapped(...args);
    }

    #calculateCover(
        origin: TokenDocumentPF2e,
        target: TokenDocumentPF2e,
        { context, debug }: { context?: CheckCheckContext; debug?: boolean } = {},
    ): ToolCover {
        if (debug) {
            clearDebug();
        }

        const wallEnabled = this.settings.wallEnabled === "enabled";
        const wall = wallEnabled ? this.calculateWallCover(origin, target, debug) : new ToolCover("wall");
        if (wall.greaterThanOrEqualToLevel("standard")) {
            return wall; // we can't have a creature cover greater than that
        }

        const creatureEnabled = this.settings.creatureEnabled === "enabled";
        const creature = creatureEnabled ? this.calculateCreatureCover(origin, target, context, debug) : null;
        return creature?.greaterThan(wall) ? creature : wall;
    }

    #onRenderCheckModifiersDialog(dialog: CheckModifiersDialog, $html: JQuery) {
        const context = dialog.context;
        if (!context?.target || context.isReroll || !context.createMessage || context.type !== "attack-roll") return;

        const originActor = context.origin?.actor ?? context.actor;
        const targetActor = context.target.actor;
        if (!originActor || !targetActor || originActor.isOfType("hazard")) return;

        const targetIsProne = isTargetProne(context);
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

function isTargetProne(context: CheckCheckContext): boolean {
    return Array.isArray(context.options)
        ? context.options.includes("item:ranged") && context.options.includes("target:condition:prone")
        : !!(context.options?.has("item:ranged") && context.options?.has("target:condition:prone"));
}

type ToolSettings = {
    creatureDead: boolean;
    creatureEnabled: SettingEnabledType;
    creatureMode: CreatureMode;
    creatureOrigin: number;
    creatureProne: boolean;
    creatureSide: number;
    creatureTarget: number;
    wallDefaultMode: WallMode;
    wallDefaultLevel: WallLevel;
    wallEnabled: SettingEnabledType;
    wallOrigin: number;
    wallTarget: number;
};

type CreatureCollision = {
    intersects: Vector[];
    range: [number, number];
    rays: [Vector, Vector][];
    rectangle: readonly [Vector, Vector, Vector, Vector];
};

type WallCollision = CreatureCollision & {
    level: WallLevel;
};

type WallConfig = fa.api.DocumentSheetV2<fa.api.DocumentSheetConfiguration<WallDocument>>;

type SettingEnabledType = (typeof SETTING_ENABLED)[number];

type CreatureMode = (typeof CREATURE_MODES)[number];

type WallFlagLevel = (typeof WALL_FLAG_LEVELS)[number];
type WallLevel = (typeof WALL_LEVELS)[number];

type WallFlagMode = (typeof WALL_FLAG_MODES)[number];
type WallMode = (typeof WALL_MODES)[number];

type TestWallCollisionOptions = {
    debug?: boolean;
    originSpread?: number;
    targetSpread?: number;
};

type TestCreaturesCoverOptions = {
    context?: CheckCheckContext;
    debug?: boolean;
    mode?: CreatureMode;
    originSpread?: number;
    sideScale?: number;
    skipDead?: boolean;
    skipProne?: boolean;
    targetSpread?: number;
};

export { AutoCoverTool };
