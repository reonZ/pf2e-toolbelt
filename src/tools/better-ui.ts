import {
    activateHooksAndWrappers,
    createToggleableHook,
    toggleHooksAndWrappers,
    TokenPF2e,
} from "module-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";

class BetterUITool extends ModuleTool<ToolSettings> {
    #unscaleTokenHUDHooks = [
        createToggleableHook("canvasPan", this.#onCanvasPan.bind(this)),
        createToggleableHook("renderTokenHUD", this.#onRenderTokenHUD.bind(this)),
    ];

    get key(): "betterUI" {
        return "betterUI";
    }

    get settingsSchema(): ToolSettingsList<ToolSettings> {
        return [
            {
                key: "unscaleTokenHUD",
                type: Boolean,
                default: false,
                scope: "user",
                onChange: (value: boolean) => {
                    toggleHooksAndWrappers(this.#unscaleTokenHUDHooks, value);
                },
            },
        ];
    }

    init(isGM: boolean): void {
        if (this.settings.unscaleTokenHUD) {
            activateHooksAndWrappers(this.#unscaleTokenHUDHooks);
        }
    }

    #onRenderTokenHUD(hud: TokenHUD, html: HTMLElement) {
        requestAnimationFrame(() => {
            this.#scaleTokenHUD(html);
        });
    }

    #onCanvasPan() {
        this.#scaleTokenHUD();
    }

    #scaleTokenHUD(html = document.getElementById("token-hud")) {
        if (!html) return;

        const scale = 1 / canvas.stage.scale.x;
        const width = parseInt(html.style.width) || 100;
        const height = parseInt(html.style.height) || 100;
        const x = (width * scale - width) / 2 / scale;
        const y = (height * scale - height) / 2 / scale;

        // for (const el of html.childNodes) {
        //     if (!(el instanceof HTMLElement)) continue;
        //     el.style.transform = `scale(${scale})`;
        // }
        // html.style.transform = `scale(${scale}) translate(-${x}px, -${y}px)`;
        this.#test();
    }

    #test() {
        const token = canvas.hud.token.object as TokenPF2e | undefined;
        if (!token) return;

        const gridSize = canvas.grid.size;
        const scale = token.worldTransform.a;
        const uiScale = canvas.dimensions.uiScale;
        const transform = canvas.stage.worldTransform;
        const bounds = token.bounds;

        const worldLeft = transform.a * bounds.x + transform.c * bounds.y + transform.tx;
        const worldTop = transform.b * bounds.x + transform.d * bounds.y + transform.ty;
        const worldWidth = bounds.width * scale;
        const worldHeight = bounds.height * scale;

        const width = (worldWidth / uiScale) * (gridSize / 100);
        const height = (worldHeight / uiScale) * (gridSize / 100);
        const left = worldLeft + (worldWidth - width) / 2;
        const top = worldTop + (worldHeight - height) / 2;
    }
}

type ToolSettings = {
    unscaleTokenHUD: boolean;
};

export { BetterUITool };
