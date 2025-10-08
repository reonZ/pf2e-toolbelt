import {
    activateHooksAndWrappers,
    createHook,
    createToggleableWrapper,
    TileDocumentPF2e,
    TokenPF2e,
} from "module-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";

class UndergroundTool extends ModuleTool<ToolSettings> {
    #enabledHooks = [
        createHook("drawPrimaryCanvasGroup", this.#onDrawPrimaryCanvasGroup.bind(this)),
        createToggleableWrapper(
            "WRAPPER",
            "CONFIG.Token.objectClass.prototype._refreshElevation",
            this.#tokenRefreshElevation,
            { context: this }
        ),
    ];

    #tilesPrepareBaseDataWrapper = createToggleableWrapper(
        "WRAPPER",
        "CONFIG.Tile.documentClass.prototype.prepareBaseData",
        this.#tileDocumentPrepareBaseData,
        { context: this }
    );

    #drawCanvas = foundry.utils.debounce(() => {
        canvas.tokens.draw();
    }, 1);

    get key(): "underground" {
        return "underground";
    }

    get settingsSchema(): ToolSettingsList<ToolSettings> {
        return [
            {
                key: "enabled",
                type: Boolean,
                default: false,
                scope: "world",
                requiresReload: true,
            },
            {
                key: "tiles",
                type: Boolean,
                default: false,
                scope: "world",
                requiresReload: true,
            },
            {
                key: "mode",
                type: String,
                default: "greyscale",
                choices: ["normal", "greyscale", "sepia"],
                scope: "user",
                onChange: () => {
                    this.#drawCanvas();
                },
            },
            {
                key: "alpha",
                type: Number,
                default: 1,
                range: {
                    min: 0.5,
                    max: 1,
                    step: 0.1,
                },
                scope: "user",
                onChange: () => {
                    this.#drawCanvas();
                },
            },
            {
                key: "contrast",
                type: Number,
                default: 0.7,
                range: {
                    min: 0,
                    max: 1,
                    step: 0.1,
                },
                scope: "user",
                onChange: () => {
                    this.#drawCanvas();
                },
            },
        ];
    }

    init(isGM: boolean): void {
        if (!this.settings.enabled) return;

        activateHooksAndWrappers(this.#enabledHooks);
        this.#tilesPrepareBaseDataWrapper.toggle(this.settings.tiles);
    }

    #tileDocumentPrepareBaseData(tile: TileDocumentPF2e, wrapped: libWrapper.RegisterCallback) {
        if (tile.elevation <= 0) {
            tile.elevation = -Number.MAX_VALUE;
        }
        wrapped();
    }

    #onDrawPrimaryCanvasGroup(group: PrimaryCanvasGroup) {
        group.background.elevation = -Number.MAX_VALUE;
    }

    #tokenRefreshElevation(token: TokenPF2e, wrapped: libWrapper.RegisterCallback) {
        wrapped();

        const elevation = token.document.elevation;

        const currentFilters = this.getInMemory<PIXI.Filter[]>(token, "elevationFilters") ?? [];
        for (const filter of currentFilters) {
            token.mesh?.filters?.findSplice((f) => f === filter);
        }

        if (elevation < 0) {
            const filters: PIXI.Filter[] = [];

            const mode = this.settings.mode;
            const alpha = this.settings.alpha;
            const contrast = this.settings.contrast;

            if (alpha < 1) {
                filters.push(new PIXI.AlphaFilter(alpha));
            }

            if (mode !== "normal") {
                const colorMatrix = new PIXI.ColorMatrixFilter();

                if (mode === "sepia") {
                    colorMatrix.sepia();
                } else {
                    colorMatrix.greyscale(0.5);
                }

                filters.push(colorMatrix);
            }

            if (contrast > 0) {
                const colorMatrix = new PIXI.ColorMatrixFilter();
                colorMatrix.contrast(contrast);
                filters.push(colorMatrix);
            }

            if (token.mesh && filters.length) {
                token.mesh.filters ??= [];
                token.mesh.filters.push(...filters);
                this.setInMemory(token, "elevationFilters", filters);
            } else {
                this.deleteInMemory(token, "elevationFilters");
            }
        }
    }
}

type ToolSettings = {
    alpha: number;
    contrast: number;
    enabled: boolean;
    mode: "normal" | "greyscale" | "sepia";
    tiles: boolean;
};

export { UndergroundTool };
