import {
    MODULE,
    R,
    registerModuleKeybinds,
    registerModuleSettings,
    userIsGM,
} from "module-helpers";
import { ModuleTool } from "module-tool";
import { ArpTool, ConditionManagerTool, ResourceTrackerTool } from "tools";

const TOOLS: ModuleTool[] = [
    new ArpTool(), //
    new ConditionManagerTool(),
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
            R.map((tool) => [tool.key, tool.settings] as const),
            R.mapToObj(([key, entries]) => [key, entries])
        )
    );

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
