import { KeybindingActionConfig, R } from "foundry-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";

class BetterToolTool extends ModuleTool<ToolSettings> {
    get key(): "betterTool" {
        return "betterTool";
    }

    get settingsSchema(): ToolSettingsList<ToolSettings> {
        return [];
    }

    get keybindsSchema(): KeybindingActionConfig[] {
        return [
            {
                name: "removeRegion",
                onDown: this.#deleteRegionUnderCursor.bind(this),
            },
        ];
    }

    #deleteRegionUnderCursor() {
        const scene = canvas.scene;
        if (!game.ready || !scene) return;

        const mouse = canvas.mousePosition;
        const regions = R.reverse(canvas.scene.regions.contents);
        const region = regions.find((region) => region.isOwner && region.polygonTree.testPoint(mouse));

        region?.delete();
    }
}

type ToolSettings = {};

export { BetterToolTool };
