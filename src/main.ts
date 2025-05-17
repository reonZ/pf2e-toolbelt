import {
    getSetting,
    MODULE,
    R,
    registerModuleKeybinds,
    registerModuleSettings,
    userIsGM,
} from "module-helpers";
import { ModuleTool } from "module-tool";
import {
    ArpTool,
    ConditionManagerTool,
    EffectsPanelTool,
    GlobalTool,
    ResourceTrackerTool,
} from "tools";

const TOOLS: ModuleTool[] = [
    new GlobalTool(),
    new ArpTool(),
    new ConditionManagerTool(),
    new EffectsPanelTool(),
    new ResourceTrackerTool(),
];

MODULE.register("pf2e-toolbelt");
MODULE.enableDebugMode();

Hooks.once("init", () => {
    const isGM = userIsGM();

    registerModuleKeybinds(
        R.pipe(
            TOOLS,
            R.map((tool) => {
                if (!tool.keybinds.length) return;
                return [tool.key, tool.keybinds] as const;
            }),
            R.filter(R.isTruthy),
            R.mapToObj(([key, entries]) => [key, entries])
        )
    );

    registerModuleSettings(
        R.pipe(
            TOOLS,
            R.map((tool) => [tool.key, tool.settingsSchema] as const),
            R.mapToObj(([key, entries]) => [key, entries])
        )
    );

    const context = (game.toolbelt ??= {} as toolbelt.GamePF2e);
    Object.defineProperty(context, "getToolSetting", {
        value: function (tool: string, setting: string) {
            return this.active ? getSetting(`${tool}.${setting}`) : undefined;
        },
        writable: false,
        configurable: false,
        enumerable: false,
    });

    for (const tool of TOOLS) {
        tool.init(isGM);
    }
});

Hooks.once("setup", () => {
    const isGM = userIsGM();

    for (const tool of TOOLS) {
        tool.setup(isGM);
    }
});

Hooks.once("ready", () => {
    const isGM = userIsGM();

    for (const tool of TOOLS) {
        tool.ready(isGM);
    }
});

MODULE.devExpose({ tools: TOOLS });
