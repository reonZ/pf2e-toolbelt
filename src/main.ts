import { getSetting, MODULE, R, registerModuleKeybinds, registerModuleSettings, userIsGM } from "foundry-helpers";
import { PF2eToolbeltEffectRegionBehaviorType } from "regions";
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

const REGIONS = [
    { class: PF2eToolbeltEffectRegionBehaviorType, icon: "fa-solid fa-person-rays", name: "effect" },
] as const;

const TOOLS = [
    actionable,
    anonymousTool,
    new ArpTool(),
    new AutoCoverTool(),
    new BetterChatTool(),
    new BetterSheetTool(),
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
            return getSetting(`${tool}.${setting}`);
        },
        writable: false,
        configurable: false,
        enumerable: false,
    });

    for (const tool of TOOLS) {
        tool._initialize(isGM);
        tool.init(isGM);
    }

    for (const region of REGIONS) {
        const path = MODULE.path(region.name);
        CONFIG.RegionBehavior.typeIcons[path] = region.icon;
        CONFIG.RegionBehavior.dataModels[path] = region.class;
        region.class.initialize();
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
