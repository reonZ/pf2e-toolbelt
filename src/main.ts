import {
    getSetting,
    MODULE,
    R,
    registerModuleKeybinds,
    registerModuleSettings,
    userIsGM,
} from "module-helpers";
import {
    ActionableTool,
    AnonymousTool,
    ArpTool,
    BetterEffectsPanelTool,
    BetterInventoryTool,
    BetterMerchantTool,
    BetterMovementyTool,
    BetterSheetTool,
    BetterTemplateTool,
    BetterTradeTool,
    ConditionManagerTool,
    DroppethTool,
    GivethTool,
    HeroActionsTool,
    IdentifyTool,
    MergeDamageTool,
    CharacterImporterTool,
    ResourceTrackerTool,
    RollTrackerTool,
    ShareDataTool,
    TargetHelperTool,
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
    new BetterMerchantTool(),
    new BetterMovementyTool(),
    new BetterTemplateTool(),
    new BetterTradeTool(),
    // new BetterUITool(),
    new CharacterImporterTool(),
    new ConditionManagerTool(),
    new DroppethTool(),
    new GivethTool(),
    new HeroActionsTool(),
    new IdentifyTool(),
    new MergeDamageTool(),
    new ResourceTrackerTool(),
    new RollTrackerTool(),
    new UnidedTool(),
    new ShareDataTool(),
    new TargetHelperTool(),
    new UndergroundTool(),
] as const;

const MAPPED_TOOLS = R.mapToObj(TOOLS, (tool) => [tool.key, tool] as const);

MODULE.register("pf2e-toolbelt");
// MODULE.enableDebugMode();

MODULE.apiExpose(R.mapValues(MAPPED_TOOLS, (tool) => tool.api));

Hooks.once("init", () => {
    const isGM = userIsGM();

    CONFIG.fontDefinitions["Handlee"] = {
        editor: true,
        fonts: [{ urls: [`modules/${MODULE.id}/fonts/Handlee/Handlee-Regular.ttf`] }],
    };

    CONFIG.fontDefinitions["Neucha"] = {
        editor: true,
        fonts: [{ urls: [`modules/${MODULE.id}/fonts/Neucha/Neucha-Regular.ttf`] }],
    };

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

    // registerWrapper(
    //     "WRAPPER",
    //     "game.pf2e.RuleElements.builtin.TokenLight.prototype.getLightData",
    //     function (
    //         this: TokenLightRuleElement,
    //         wrapped: libWrapper.RegisterCallback
    //     ): LightSourceData | null {
    //         const scene = game.scenes.current;
    //         const source = wrapped() as LightSourceData | null;
    //         if (!scene || !source || source.negative) return source;

    //         console.log(this);

    //         source.alpha *= 1 - scene.lightLevel;
    //         if (source.alpha < 0.1) return source;

    //         const sceneLights = scene.lights
    //             .filter((light) => !light.config.negative)
    //             .map((light) => light.object?.lightSource)
    //             .filter(R.isTruthy);

    //         console.log(sceneLights);

    //         for (const light of sceneLights) {
    //         }

    //         return source;
    //     }
    // );
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

export { MAPPED_TOOLS };
