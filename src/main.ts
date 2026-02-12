import { getSetting, MODULE, R, registerModuleKeybinds, registerModuleSettings, userIsGM } from "foundry-helpers";
import { ModuleTool } from "module-tool";
import {
    ActionableTool,
    AnonymousTool,
    ArpTool,
    BetterEffectsPanelTool,
    BetterInventoryTool,
    BetterMovementTool,
    BetterSheetTool,
    BetterTemplateTool,
    BetterTradeTool,
    ConditionManagerTool,
    DroppethTool,
    GivethTool,
    shareDataTool,
    UndergroundTool,
    UnidedTool,
} from "tools";

const TOOLS = [
    new ActionableTool(),
    new AnonymousTool(),
    new ArpTool(),
    new BetterSheetTool(),
    new BetterEffectsPanelTool(),
    new BetterInventoryTool(),
    // new BetterMerchantTool(),
    new BetterMovementTool(),
    new BetterTemplateTool(),
    new BetterTradeTool(),
    // new CharacterImporterTool(),
    new ConditionManagerTool(),
    new DroppethTool(),
    new GivethTool(),
    // new HeroActionsTool(),
    // new IdentifyTool(),
    // new MergeDamageTool(),
    // new ResourceTrackerTool(),
    // new RollTrackerTool(),
    new UnidedTool(),
    shareDataTool,
    // new TargetHelperTool(),
    new UndergroundTool(),
] as const satisfies ModuleTool[];

MODULE.register("pf2e-toolbelt");

for (const tool of TOOLS) {
    MODULE.apiExpose(tool.key, tool.api);
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
            R.fromEntries(),
        ),
    );

    registerModuleSettings(
        R.pipe(
            TOOLS,
            R.map((tool) => [tool.key, tool._getToolSettings()] as const),
            R.fromEntries(),
        ),
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

MODULE.debugExpose("tools", R.indexBy(TOOLS, R.prop("key")));
