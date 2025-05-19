import {
    createHook,
    createToggleableWrapper,
    deleteInMemory,
    getInMemory,
    setInMemory,
    TokenPF2e,
} from "module-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";

class UndergroundTool extends ModuleTool<ToolSettings> {
    #drawCanvasGroupHook = createHook(
        "drawPrimaryCanvasGroup",
        this.#onDrawPrimaryCanvasGroup.bind(this)
    );

    #refreshElevationWrapper = createToggleableWrapper(
        "WRAPPER",
        "CONFIG.Token.objectClass.prototype._refreshElevation",
        this.#tokenRefreshElevation,
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
                onChange: (value) => {
                    this.#drawCanvasGroupHook.toggle(value);
                    this.#refreshElevationWrapper.toggle(value);

                    if (canvas.ready) {
                        canvas.primary.background.elevation = value ? -Number.MAX_VALUE : 0;
                    }

                    this.#drawCanvas();
                },
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
        ] as const;
    }

    init(isGM: boolean): void {
        if (!this.settings.enabled) return;

        this.#drawCanvasGroupHook.activate();
        this.#refreshElevationWrapper.activate();
    }

    #onDrawPrimaryCanvasGroup() {
        canvas.primary.background.elevation = -Number.MAX_VALUE;
    }

    #tokenRefreshElevation(token: TokenPF2e, wrapped: libWrapper.RegisterCallback) {
        wrapped();

        const elevation = token.document.elevation;

        const currentFilters = getInMemory<PIXI.Filter[]>(token, "elevationFilters") ?? [];
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
                setInMemory(token, "elevationFilters", filters);
            } else {
                deleteInMemory(token, "elevationFilters");
            }
        }
    }
}

type ToolSettings = {
    enabled: boolean;
    mode: "normal" | "greyscale" | "sepia";
    alpha: number;
    contrast: number;
};

export { UndergroundTool };
