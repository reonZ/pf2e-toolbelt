import {
    ActorPF2e,
    CharacterPF2e,
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
    getChoiceSetSelection,
    getFirstActiveToken,
    getItemSourceId,
    htmlQuery,
    ItemSourcePF2e,
    MODULE,
    R,
    Rolled,
    signedInteger,
    SYSTEM,
    toggleHooksAndWrappers,
    TokenPF2e,
    ZeroToFour,
} from "foundry-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";
import {
    COVER_VALUES,
    CoverHighlightRenderer,
    CoverLevel,
    getRectEdges,
    RectEdge,
    SIZES,
    spreadToToken,
    tokenToSpread,
} from ".";
import { drawDebugLine, lineIntersect } from "tools";

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
        createToggleHook("renderCheckModifiersDialog", this.#onRenderCheckModifiersDialog.bind(this)),
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

    getExistingCovers(actor: ActorPF2e): EffectPF2e[] {
        const coverUUID = COVER_UUID();
        return actor.itemTypes.effect.filter((effect) => getItemSourceId(effect) === coverUUID);
    }

    getHighestCoverSelection(effects: EffectPF2e[], isProne: boolean): CoverSelection {
        const allSelections = effects.map((effect): CoverSelection => {
            const level = getChoiceSetSelection<{ level: CoverLevel }>(effect)?.level ?? "none";
            return { level, value: COVER_VALUES[level] };
        });
        const selections = isProne ? allSelections : allSelections.filter(({ level }) => level !== "greater-prone");

        return R.firstBy(selections, [R.prop("value"), "desc"]) ?? { level: "none", value: 0 };
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

    calculateCover(origin: TokenPF2e, target: TokenPF2e): { type: "wall" | "creature"; level: CoverLevel } {
        const debug = MODULE.isDebug;

        if (debug) {
            canvas.controls.debug.clear();
        }

        if (this.intersectsWithWall(origin, target, debug)) {
            return { type: "wall", level: "standard" };
        }

        const cover = this.calculateCreaturesCover(origin, target, debug);
        return { type: "creature", level: cover };
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

    calculateCreaturesCover(originToken: TokenPF2e, targetToken: TokenPF2e, debug: boolean = false): CoverLevel {
        const scene = originToken.scene;
        const setting = this.settings.creature;
        const originActor = originToken.actor;
        const targetActor = targetToken.actor;

        if (!scene || setting === "disabled" || !originActor || !targetActor) {
            return "none";
        }

        const origin = originToken.center;
        const target = targetToken.center;

        if (debug) {
            drawDebugLine(origin, target, "blue");
        }

        let cover: CoverLevel = "none";
        const skipDead = this.settings.dead;
        const skipProne = this.settings.prone;
        const originSize = SIZES[originActor.size];
        const targetSize = SIZES[targetActor.size];
        const margin = setting === "ten" ? 0.1 : setting === "twenty" ? 0.2 : 0;
        const canHaveExtraLarges = originSize < SIZES.huge && targetSize < SIZES.huge;

        const isExtraLarge = (actor: ActorPF2e) => {
            const size = SIZES[actor.size];
            return size - originSize >= 2 && size - targetSize >= 2;
        };

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

        for (const tokenDocument of scene.tokens) {
            const token = tokenDocument.object;
            const actor = token?.actor;

            if (!token || !actor || tokenDocument.hidden) continue;
            if (token === originToken || token === targetToken) continue;
            if (skipDead && !actor.hitPoints?.value) continue;
            if (skipProne && actor.getCondition("prone")) continue;

            // we handle the 'Aim-Aiding' armor rune
            if (
                actor.type === "character" &&
                actor.isAllyOf(originActor) &&
                (actor as CharacterPF2e).armorClass.options.has("armor:rune:property:aim-aiding")
            )
                continue;

            const extraLarge = canHaveExtraLarges && isExtraLarge(actor);

            // we don't need to check intersection on that token as it won't give more than what we already have
            if (canHaveExtraLarges && !extraLarge && cover === "lesser") continue;
            // no intersection
            if (!intersectsWith(token)) continue;

            // we can't have extra large check so this is a much as we will ever get
            if (!canHaveExtraLarges) {
                return "lesser";
            }

            // we can never get anything beyond 'standard' so we check out now
            if (isExtraLarge(actor)) {
                return "standard";
            }

            // we can still have an extra large check later on so we have to keep going
            cover = "lesser";
        }

        return cover;
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

        const targetIsProne = this.isTargetProne(context);
        const existing = this.getHighestCoverSelection(this.getExistingCovers(targetActor), targetIsProne);
        if (existing.value >= COVER_VALUES.standard) {
            return wrapped(...args);
        }

        const cover = this.calculateCover(originToken, targetToken);

        if (COVER_VALUES[cover.level] > existing.value) {
            const items = foundry.utils.deepClone(targetActor._source.items);
            await this.#addCoverSourceToContext(context, items, cover.level, this.localize(cover.type));
        }

        return wrapped(...args);
    }

    #onRenderCheckModifiersDialog(dialog: CheckModifiersDialog, $html: JQuery) {
        const context = dialog.context;
        if (!context?.target || context.isReroll || !context.createMessage || context.type !== "attack-roll") return;

        const originActor = context.origin?.actor ?? context.actor;
        const targetActor = context.target.actor;
        if (!originActor || !targetActor || originActor.isOfType("hazard")) return;

        const targetIsProne = this.isTargetProne(context);
        const coverEffects = this.getExistingCovers(targetActor);
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

        htmlQuery(html, "button.roll")?.addEventListener(
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
    creature: (typeof CREATURE_SETTINGS)[number];
    dead: boolean;
    prone: boolean;
    wall: (typeof WALL_INTERSECTIONS_SETTING)[number];
};

type CoverSelection = { level: CoverLevel; value: ZeroToFour };

export { AutoCoverTool };
