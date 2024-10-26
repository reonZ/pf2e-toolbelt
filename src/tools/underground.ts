import { createTool } from "../tool";

const { config, settings, wrapper, hook } = createTool({
    name: "underground",
    settings: [
        {
            key: "enabled",
            type: Boolean,
            default: false,
            onChange: (enabled) => {
                wrapper.toggle(enabled);
                hook.toggle(enabled);

                if (canvas.ready) {
                    canvas.primary.background.elevation = enabled ? -Number.MAX_VALUE : 0;
                }
            },
        },
        {
            key: "mode",
            type: String,
            choices: ["normal", "greyscale", "sepia"],
            default: "greyscale",
            scope: "client",
            onChange: () => {
                canvas.tokens.draw();
            },
        },
        {
            key: "alpha",
            type: Number,
            range: {
                min: 0.5,
                max: 1,
                step: 0.1,
            },
            default: 1,
            scope: "client",
            onChange: () => {
                canvas.tokens.draw();
            },
        },
        {
            key: "contrast",
            type: Number,
            range: {
                min: 0,
                max: 1,
                step: 0.1,
            },
            default: 0.7,
            scope: "client",
            onChange: () => {
                canvas.tokens.draw();
            },
        },
    ],
    wrappers: [
        {
            path: "CONFIG.Token.objectClass.prototype._refreshElevation",
            callback: tokenRefreshElevation,
        },
    ],
    hooks: [
        {
            event: "drawPrimaryCanvasGroup",
            listener: onDrawPrimaryCanvasGroup,
        },
    ],
    init: () => {
        if (!settings.enabled) return;

        wrapper.activate();
        hook.activate();
    },
} as const);

function onDrawPrimaryCanvasGroup() {
    canvas.primary.background.elevation = -Number.MAX_VALUE;
}

function tokenRefreshElevation(this: TokenPF2e, wrapped: libWrapper.RegisterCallback) {
    wrapped();

    const elevation = this.document.elevation;

    for (const filter of this.elevationFilters ?? []) {
        this.mesh.filters?.findSplice((f) => f === filter);
    }

    if (elevation < 0) {
        this.elevationFilters = [];

        const mode = settings.mode;
        const alpha = settings.alpha;
        const contrast = settings.contrast;

        if (alpha < 1) {
            this.elevationFilters.push(new PIXI.AlphaFilter(alpha));
        }

        if (mode !== "normal") {
            const colorMatrix = new PIXI.ColorMatrixFilter();
            if (mode === "sepia") colorMatrix.sepia();
            else colorMatrix.greyscale(0.5);
            this.elevationFilters.push(colorMatrix);
        }

        if (contrast > 0) {
            const colorMatrix = new PIXI.ColorMatrixFilter();
            colorMatrix.contrast(contrast);
            this.elevationFilters.push(colorMatrix);
        }

        if (this.elevationFilters.length) {
            this.mesh.filters ??= [];
            this.mesh.filters.push(...this.elevationFilters);
        }
    }
}

export { config as undergroundTool };
