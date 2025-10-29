import {
    activateHooksAndWrappers,
    createToggleableHook,
    toggleHooksAndWrappers,
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

        html.style.transform = `scale(${scale}) translate(-${x}px, -${y}px)`;
    }
}

type ToolSettings = {
    unscaleTokenHUD: boolean;
};

export { BetterUITool };
