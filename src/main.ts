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
    ActionableTool,
    AnonymousTool,
    ArpTool,
    BetterEffectsPanelTool,
    BetterInventoryTool,
    BetterMerchantTool,
    BetterMovementyTool,
    BetterTemplateTool,
    BetterTradeTool,
    ConditionManagerTool,
    DroppethTool,
    GivethTool,
    IdentifyTool,
    MergeDamageTool,
    ResourceTrackerTool,
    RollTrackerTool,
    TargetHelperTool,
    UndergroundTool,
    UnidedTool,
} from "tools";

const TOOLS: ModuleTool[] = [
    new ActionableTool(),
    new AnonymousTool(),
    new ArpTool(),
    new BetterEffectsPanelTool(),
    new BetterInventoryTool(),
    new BetterMerchantTool(),
    new BetterMovementyTool(),
    new BetterTemplateTool(),
    new BetterTradeTool(),
    new ConditionManagerTool(),
    new DroppethTool(),
    new GivethTool(),
    new IdentifyTool(),
    new MergeDamageTool(),
    new ResourceTrackerTool(),
    new RollTrackerTool(),
    new UnidedTool(),
    new TargetHelperTool(),
    new UndergroundTool(),
];

MODULE.register("pf2e-toolbelt");
// MODULE.enableDebugMode();

for (const tool of TOOLS) {
    MODULE.apiExpose({
        [tool.key]: tool.api,
    });
}

Hooks.once("init", () => {
    const isGM = userIsGM();

    registerModuleKeybinds(
        R.pipe(
            TOOLS,
            R.map((tool) => {
                const schemas = tool.keybindsSchema;
                if (schemas.length) {
                    return [tool.key, schemas] as const;
                }
            }),
            R.filter(R.isTruthy),
            R.mapToObj(([key, entries]) => [key, entries])
        )
    );

    registerModuleSettings(
        R.pipe(
            TOOLS,
            R.map((tool) => [tool.key, tool._getToolSettings()] as const),
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
        tool._initialize(isGM);
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

MODULE.devExpose({ tools: R.mapToObj(TOOLS, (tool) => [tool.key, tool]) });
