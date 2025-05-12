import { MODULE, R } from "module-helpers";
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
