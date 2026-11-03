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
    getFirstActiveToken,
    htmlQuery,
    ItemSourcePF2e,
    Modifier,
    MODULE,
    R,
    Rolled,
    ScenePF2e,
    toggleHooksAndWrappers,
    TokenDocumentPF2e,
    TokenPF2e,
    Wall,
} from "foundry-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";
import { clearDebug, drawDebug } from "tools";
import {
    CoverHighlightRenderer,
    CoverLevel,
    createBoundaryFromTokens,
    createSpreadRaysGenerator,
    createTokenSpreadGenerator,
    GeneratedSpreadRay,
    generateSpreadRay,
    getSideOfPointFromLine,
    getTokenSpreadData,
    lineIntersectRectangle,
    SpreadRaysGenerator,
    TOKEN_FACES_A,
    TOKEN_FACES_B,
    TokenFaceIndices,
    ToolCover,
    Triangle,
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

const SETTING_ENABLED = ["disabled", "manual", "both", "wall", "creature"] as const;

const CREATURE_MODES = ["any", "opposite"] as const;

const WALL_LEVELS = ["lesser", "standard", "greater"] as const satisfies CoverLevel[];
const WALL_MODES = ["move", "none", "normal"] as const;
const WALL_FLAG_LEVELS = ["default", ...WALL_LEVELS] as const;
const WALL_FLAG_MODES = ["default", "none", "normal"] as const;

class AutoCoverTool extends ModuleTool<ToolSettings> {
    #enabledWrappers = [
        createToggleWrapper("WRAPPER", "game.pf2e.Check.roll", this.#checkRoll, { context: this }),
        createToggleWrapper(
            "WRAPPER",
            "foundry.applications.sheets.WallConfig.prototype._renderHTML",
            this.#wallConfigRenderHTML,
            { context: this },
        ),
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

    #manualWrappers = [createToggleHook("renderCheckModifiersDialog", this.#onRenderCheckModifiersDialog.bind(this))];

    get key(): "autoCover" {
        return "autoCover";
    }

    get settingsSchema(): ToolSettingsList<ToolSettings> {
        return [
            {
                key: "coverEnabled",
                type: String,
                scope: "world",
                default: "disabled",
                choices: SETTING_ENABLED,
                onChange: () => {
                    this.configurate();
                },
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
        const enabled = this.settings.coverEnabled;
        toggleHooksAndWrappers(this.#enabledWrappers, enabled !== "disabled" && enabled !== "manual");
        toggleHooksAndWrappers(this.#manualWrappers, enabled !== "disabled");
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

    calculateCover(
        origin: TokenDocumentPF2e,
        target: TokenDocumentPF2e,
        { context, debug }: { context?: CheckCheckContext; debug?: boolean } = {},
    ): ToolCover {
        if (debug) {
            clearDebug();
        }

        const enabled = this.settings.coverEnabled;

        const wallEnabled = enabled === "both" || enabled === "wall";
        const wall = wallEnabled ? this.calculateWallCover(origin, target, debug) : new ToolCover("wall");
        if (wall.greaterThanOrEqualToLevel("standard")) {
            return wall; // we can't have a creature cover greater than that
        }

        const creatureEnabled = enabled === "both" || enabled === "creature";
        const creature = creatureEnabled ? this.calculateCreatureCover(origin, target, context, debug) : null;
        return creature?.greaterThan(wall) ? creature : wall;
    }

    calculateCreatureCover(
        origin: TokenDocumentPF2e,
        target: TokenDocumentPF2e,
        context: CheckCheckContext = {},
        debug: boolean = false,
    ) {
        const cover = this.testCreaturesCover(origin, target, {
            context,
            debug,
            mode: this.settings.creatureMode,
            sideScale: this.settings.creatureSide,
            skipDead: this.settings.creatureDead,
            skipProne: this.settings.creatureProne,
        } satisfies Required<TestCreaturesCoverOptions>);
        return new ToolCover("creature", cover?.level ?? "none");
    }

    calculateWallCover(origin: TokenDocumentPF2e, target: TokenDocumentPF2e, debug: boolean = false): ToolCover {
        const collision = this.testWallsCollisions(origin, target, {
            debug,
            originSpread: this.settings.wallOrigin,
            targetSpread: this.settings.wallTarget,
        } satisfies Required<TestWallCollisionOptions>);
        return new ToolCover("wall", collision?.level ?? "none");
    }

    testCreaturesCover(
        origin: TokenDocumentPF2e,
        target: TokenDocumentPF2e,
        { context, debug, mode = "any", sideScale = 1, skipDead, skipProne }: TestCreaturesCoverOptions = {},
    ): { collisions: BaseCollision[]; level: CreatureLevel } | undefined {
        const distance = context?.target?.distance ?? (target?.object && origin.object?.distanceTo(target?.object));
        if ((distance ?? 0) <= 5) return; // we avoid calculating creature cover with adjacent target

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

        let level: CreatureLevel = "none";
        let collisions: BaseCollision[] | undefined;
        const ray = generateSpreadRay(getTokenSpreadData(origin).center, getTokenSpreadData(target).center);

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
            if (!extraLarge && level === "lesser") continue;

            const _collisions = this.#testCreatureCollision(token, ray, sideScale, mode);
            if (!_collisions) continue; // no intersection

            // we can't have extra large check so this is as much as we will ever get
            if (!canHaveExtraLarges) {
                level = "lesser";
                collisions = _collisions;
                break;
            }

            // we can never get anything beyond 'standard' so we check out now
            if (extraLarge) {
                level = "standard";
                collisions = _collisions;
                break;
            }

            // we can still have extra large checks later on so we have to keep going
            level = "lesser";
            collisions ??= _collisions;
        }

        if (!collisions) return;

        if (debug) {
            for (const collision of collisions) {
                this.#drawDebug(origin, collision);
            }
        }

        return { collisions, level };
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
            this.#drawDebug(origin, collision);
        }

        return collision;
    }

    #testCreatureCollision(
        token: TokenDocumentPF2e,
        [O, T, D]: GeneratedSpreadRay,
        sideScale: number,
        mode: CreatureMode,
    ): BaseCollision[] | undefined {
        const spreadValue = Math.clamp(sideScale, 0.75, 1) - 0.5;
        // we offset by 1 to avoid awkward outer corner collisions on 'any' mode
        const spread = createTokenSpreadGenerator(token, spreadValue, mode === "any" ? 1 : 0);
        // we preemptively eleminate tokens that would never intersect rays
        if (spread.ceil < Math.min(O.z, T.z) || spread.floor > Math.max(O.z, T.z)) return;

        const collisions: BaseCollision[] = [];
        const points: Vector[] = spread.toArray();
        const facesA = mode === "opposite" ? TOKEN_FACES_A : [...TOKEN_FACES_A, ...TOKEN_FACES_B];
        const facesB = mode === "opposite" ? TOKEN_FACES_B : undefined;

        const intersectFace = (
            facesList: TokenFaceIndices[],
            faceIndex: number,
        ): { point: Vector; triangle: Triangle } | undefined => {
            const triangle = R.map(facesList[faceIndex], (pointIndex) => points[pointIndex]);
            const point = lineIntersectRectangle(O, D, triangle);
            return point ? { point, triangle } : undefined;
        };

        for (let faceIndex = 0; faceIndex < facesA.length; faceIndex++) {
            const intersectA = intersectFace(facesA, faceIndex);
            if (!intersectA) continue;

            if (facesB) {
                const intersectB = intersectFace(facesB, faceIndex);
                if (!intersectB) continue;

                collisions.push({
                    intersects: [intersectB.point],
                    range: [spread.floor, spread.ceil],
                    rays: [[O, T]],
                    triangle: intersectB.triangle,
                });
            }

            collisions.push({
                intersects: [intersectA.point],
                range: [spread.floor, spread.ceil],
                rays: [[O, T]],
                triangle: intersectA.triangle,
            });

            return collisions;
        }
    }

    #testWallCollisions(
        scene: ScenePF2e,
        raysGenerator: SpreadRaysGenerator,
        walls: Set<Wall>,
    ): WallCollision | undefined {
        const { distance, size } = scene.grid;

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

                let collision: WallCollision | undefined;

                const triangle = [
                    Vector.fromData(edge.a, bottom), // v0
                    Vector.fromData(edge.b, bottom), // v1
                    Vector.fromData(edge.a, top), // v2
                ] as const;

                for (const [O, T, D] of raysGenerator()) {
                    const point = lineIntersectRectangle(O, D, triangle);

                    // we move on to the next edge
                    if (!point) continue range;

                    // we cache the collision
                    collision ??= {
                        intersects: [],
                        level: this.getWallLevel(wall),
                        range: [bottom, top],
                        rays: [],
                        triangle,
                    };

                    collision.intersects.push(point);
                    collision.rays.push([O, T]);
                }

                // all rays have intersected
                if (collision) {
                    return collision;
                }
            }
        }
    }

    #drawDebug(origin: TokenDocumentPF2e, collision: BaseCollision) {
        const { intersects, range, rays, triangle } = collision;
        const [bottom, top] = range;
        const [e0, e1] = triangle;

        for (const [O, T] of rays) {
            drawDebug("red", O, T); // line between tokens
        }

        // no point in displaying infinite sized walls
        if (bottom !== Number.MIN_SAFE_INTEGER && top !== Number.MAX_SAFE_INTEGER) {
            const u = Vector.fromData(e1).subtract(e0);
            // we scale horizontally if the edge isn't of an appropriate length
            const m = u.vector2d.magnitude;
            const scalarH = Math.max(m, 100) / m;
            const scaleH = (p: Vector) => {
                if (scalarH === 1 || p.equals2d(e0)) return p;
                const su = p.subtract(e0);
                return su.multiplyBy(scalarH).subtract(su).add(p);
            };
            // we scale vertically if the wall's height is inappropriate
            const depth = top - bottom;
            const scalarV = Math.clamp(depth, 100, Math.max(800, m * scalarH)) / depth;
            // we project the points onto our triangle section
            const side = getSideOfPointFromLine(e0, e1, origin.center);
            const proj = u.rotate90(side === 1).normalize;
            const projectPoint = (p: Vector) => {
                const s = scaleH(p);
                return p.z === bottom ? s : proj.multiplyBy((p.z - bottom) * scalarV).add(s);
            };
            const [v0, v1, v3] = R.map(triangle, projectPoint);
            const v2 = projectPoint(Vector.fromData(v1, v3.z));
            drawDebug("blue", v0, v1, v2, v3, true); // projected triangle section
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

        if (!context?.target || context.isReroll || (!isAttackRoll(context) && !isStealthSkillCheck(context))) {
            return wrapped(...args);
        }

        // we need to add/check the cover of self when rolling a skill check
        const { originActor, targetActor } = extractActors(context);

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

        const targetProne = targetIsProne(context);
        const exist = ToolCover.fromActor(targetActor, targetProne);
        if (exist.greaterThanLevel("standard")) {
            return wrapped(...args); // we can't have anything greater than the currently existing effect
        }

        const debug = MODULE.isDebug;
        if (debug) {
            clearDebug();
        }

        const cover = this.calculateCover(origin, target, { context, debug: MODULE.isDebug });

        if (cover.greaterThan(exist) && (context.type === "attack-roll" || cover.greaterThanLevel("lesser"))) {
            const items = foundry.utils.deepClone(targetActor._source.items);
            await this.#addCoverSourceToContext(context, items, cover);

            // we add the modifier
            if (context.type === "skill-check") {
                const check = args[0];
                check.push(cover.createModifier());
            }
        }

        return wrapped(...args);
    }

    #onRenderCheckModifiersDialog(dialog: CheckModifiersDialog, $html: JQuery) {
        const context = dialog.context;

        if (
            context.isReroll ||
            (!isAttackRoll(context) && !isAreaReflexSaveCheck(context) && !isStealthSkillCheck(context))
        )
            return;

        const { originActor, targetActor } = extractActors(context);
        if (!targetActor || originActor?.isOfType("hazard")) return;

        const isAttack = context.type === "attack-roll";
        const targetProne = targetIsProne(context);
        const coverEffects = ToolCover.getExistingCovers(targetActor);
        const current = ToolCover.fromEffects(coverEffects, targetProne);
        const overriden = this.getInMemory<ToolCover>(dialog, "overriden") ?? new ToolCover("overriden", current.level);

        // we recover the original modifier if anything
        const originalModifier =
            !isAttack && current.hasCover
                ? (this.getInMemory<Modifier>(dialog, "originalModifier") ??
                  dialog.check.modifiers.find((x) => x.slug === "cover"))
                : undefined;

        // we keep stuff in memory for render
        this.setInMemory(dialog, { originalModifier, overriden });

        const html = $html[0];
        const separator = document.createElement("hr");

        const select = foundry.applications.fields.createSelectInput({
            name: "override-cover",
            options: ToolCover.getSelectOptions(targetProne, !isAttack),
            value: overriden.level,
        });

        const bonusSpan = createHTMLElement("span", {
            content: overriden.signedBonus,
        });

        const row = createHTMLElement("div", {
            classes: ["override-cover"],
            content: `<label>${this.localize("override")}</label>`,
        });

        row.append(bonusSpan, select);

        htmlQuery(html, ".add-modifier-panel")?.after(separator, row);

        select.addEventListener("change", () => {
            const value = select.value as CoverLevel;

            overriden.updateLevel(value);
            bonusSpan.innerText = overriden.signedBonus;

            if (!isAttack) {
                const replacement = overriden.equalsLevel("none")
                    ? undefined
                    : overriden.equals(current)
                      ? originalModifier
                      : overriden.createModifier();

                if (!dialog.check["_modifiers"].findSplice((x) => x.slug === "cover", replacement) && replacement) {
                    dialog.check["_modifiers"].push(replacement);
                }

                dialog.check.calculateTotal();
                dialog.render();
            }
        });

        htmlQuery(html, `button[type="submit"]`)?.addEventListener(
            "click",
            async (event) => {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();

                if (!overriden.equals(current)) {
                    const ids = coverEffects.map((effect) => effect.id);
                    const allItems = foundry.utils.deepClone(targetActor._source.items);
                    const items = ids.length ? allItems.filter((item) => !R.isIncludedIn(item._id, ids)) : allItems;

                    await this.#addCoverSourceToContext(context, items, overriden);
                }

                dialog.resolve(true);
                dialog.isResolved = true;
                dialog.close();
            },
            { capture: true },
        );

        dialog.setPosition();
    }

    async #addCoverSourceToContext(context: CheckCheckContext, items: ItemSourcePF2e[], cover: ToolCover) {
        const source = await cover.createSource();
        const prefix = context.type === "skill-check" ? "origin" : "target";
        if (!source || !context[prefix]?.actor) return;

        items.push(source);

        context[prefix].actor = context[prefix].actor.clone({ items }, { keepId: true });

        if (prefix === "target" && context.dc?.slug) {
            const statistic = context[prefix].actor.getStatistic(context.dc.slug)?.dc;

            if (statistic) {
                context.dc.value = statistic.value;
                context.dc.statistic = statistic;
            }
        }
    }
}

function targetIsProne(context: CheckCheckContext): boolean {
    if (context.type !== "attack-roll" || !context.options) return false;
    return context.options.has("item:ranged") && context.options.has("target:condition:prone");
}

function isAttackRoll(context: CheckCheckContext): boolean {
    return context.type === "attack-roll";
}

function isAreaReflexSaveCheck(context: CheckCheckContext): boolean {
    if (context.type !== "saving-throw" || !context.options) return false;
    return context.options.has("area-effect") && context.options.has("check:statistic:reflex");
}

function isStealthSkillCheck(context: CheckCheckContext): boolean {
    if (context.type !== "skill-check" || !context.options) return false;
    return (
        context.options.has("action:hide") ||
        context.options.has("action:sneak") ||
        context.options.has("action:avoid-notice")
    );
}

function extractActors(context: CheckCheckContext): {
    originActor: Maybe<ActorPF2e>;
    targetActor: Maybe<ActorPF2e>;
} {
    if (context.type === "saving-throw") {
        return {
            originActor: context.origin?.actor,
            targetActor: context.target?.actor ?? context.actor,
        };
    }

    if (context.type === "skill-check") {
        return {
            originActor: context.target?.actor,
            targetActor: context.origin?.actor ?? context.actor,
        };
    }

    return {
        originActor: context.origin?.actor ?? context.actor,
        targetActor: context.target?.actor,
    };
}

type ToolSettings = {
    coverEnabled: SettingEnabledType;
    creatureDead: boolean;
    creatureMode: CreatureMode;
    creatureProne: boolean;
    creatureSide: number;
    wallDefaultMode: WallMode;
    wallDefaultLevel: WallLevel;
    wallOrigin: number;
    wallTarget: number;
};

type BaseCollision = {
    intersects: Vector[];
    range: [number, number];
    rays: [Vector, Vector][];
    triangle: Triangle;
};

type WallCollision = BaseCollision & {
    level: WallLevel;
};

type WallConfig = fa.api.DocumentSheetV2<fa.api.DocumentSheetConfiguration<WallDocument>>;

type SettingEnabledType = (typeof SETTING_ENABLED)[number];

type CreatureMode = (typeof CREATURE_MODES)[number];
type CreatureLevel = "none" | "lesser" | "standard";

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
    sideScale?: number;
    skipDead?: boolean;
    skipProne?: boolean;
};

export { AutoCoverTool };
