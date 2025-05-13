import {
    MODULE,
    R,
    registerModuleKeybinds,
    registerModuleSettings,
    userIsGM,
} from "module-helpers";
import { ModuleTool } from "module-tool";
import { ArpTool, ConditionManagerTool } from "tools";

const TOOLS: ModuleTool<Record<string, string | number | boolean>>[] = [
    new ArpTool(),
    new ConditionManagerTool(),
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

    MODULE.debug(TOOLS);
});

Hooks.once("ready", () => {
    const isGM = userIsGM();

    for (const tool of TOOLS) {
        tool.ready(isGM);
    }
});
