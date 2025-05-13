import { MODULE, R, userIsGM } from "module-helpers";
import { ModuleTool } from "tool";
import { ArpTool } from "tools";

const TOOLS: ModuleTool<Record<string, string | number | boolean>>[] = [
    new ArpTool(), //
];

MODULE.register("pf2e-toolbelt", {
    settings: R.pipe(
        TOOLS,
        R.map((tool) => [tool.key, tool.settings] as const),
        R.mapToObj(([key, entries]) => [key, entries])
    ),
});
MODULE.enableDebugMode();

Hooks.once("init", () => {
    const isGM = userIsGM();

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
