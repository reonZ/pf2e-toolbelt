import { MODULE, R, registerModuleKeybinds, registerModuleSettings, userIsGM } from "foundry-helpers";
import { ModuleTool } from "module-tool";
import { initializeRegions } from "regions";
import {
    actionable,
    anonymousTool,
    ArpTool,
    AutoCoverTool,
    BetterChatTool,
    BetterEffectsPanelTool,
    BetterInventoryTool,
    betterMerchantTool,
    BetterMovementTool,
    BetterSheetTool,
    BetterToolTool,
    BetterTradeTool,
    CharacterImporterTool,
    ConditionManagerTool,
    DroppethTool,
    GivethTool,
    HeroActionsTool,
    IdentifyTool,
    // PerceptionTool,
    ResourceTrackerTool,
    RollTrackerTool,
    shareDataTool,
    targetHelperTool,
    UnidedTool,
} from "tools";

const TOOLS = [
    actionable,
    anonymousTool,
    new ArpTool(),
    new AutoCoverTool(),
    new BetterSheetTool(),
    new BetterChatTool(),
    new BetterEffectsPanelTool(),
    new BetterInventoryTool(),
    betterMerchantTool,
    new BetterMovementTool(),
    new BetterToolTool(),
    new BetterTradeTool(),
    new CharacterImporterTool(),
    new ConditionManagerTool(),
    new DroppethTool(),
    new GivethTool(),
    new HeroActionsTool(),
    new IdentifyTool(),
    // new PerceptionTool(),
    new ResourceTrackerTool(),
    new RollTrackerTool(),
    new UnidedTool(),
    shareDataTool,
    targetHelperTool,
    // new UndergroundTool(),
] as const;

const INDEXED_TOOLS: Record<string, ModuleTool> = R.indexBy(TOOLS, R.prop("key"));

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
            return INDEXED_TOOLS[tool]?.settings[setting];
        },
        writable: false,
        configurable: false,
        enumerable: false,
    });

    for (const tool of TOOLS) {
        tool._initialize(isGM);
        tool.init(isGM);
    }

    initializeRegions();
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

MODULE.debugExpose("tools", INDEXED_TOOLS);
