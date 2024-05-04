import { MODULE, userIsGM } from "pf2e-api";
import { onRenderSettingsConfig, registerToolsSettings } from "./settings";
import type { ToolConfig } from "./tool";
import { arpTool } from "./tools/arp";
import { debugTool } from "./tools/debug";
import { effectsPanelTool } from "./tools/effectsPanel";
import { givethTool } from "./tools/giveth";
import { heroActionsTool } from "./tools/heroActions";
import { noBulkTool } from "./tools/noBulk";
import { unidedTool } from "./tools/unided";
import { untargetTool } from "./tools/untarget";
import { templateHelperTool } from "./tools/templateHelper";
import { spellsSummaryTool } from "./tools/spellsSummary";
import { stancesTool } from "./tools/stances";
import { ShareTool } from "./tools/share";
import { targetHelperTool } from "./tools/targetHelper";
import { mergeDamageTool } from "./tools/mergeDamage";
import { hideDamageTool } from "./tools/hideDamage";
import { useButtonTool } from "./tools/useButton";
import { betterMerchantTool } from "./tools/betterMerchant";

MODULE.register("pf2e-toolbelt", "PF2e Toolbelt");

const TOOLS: ToolConfig[] = [
    arpTool,
    betterMerchantTool,
    debugTool,
    untargetTool,
    effectsPanelTool,
    givethTool,
    heroActionsTool,
    hideDamageTool,
    mergeDamageTool,
    noBulkTool,
    ShareTool,
    unidedTool,
    spellsSummaryTool,
    stancesTool,
    targetHelperTool,
    templateHelperTool,
    useButtonTool,
];

Hooks.once("init", () => {
    const isGM = userIsGM();

    registerToolsSettings(TOOLS, isGM);

    const module = MODULE.current;
    module.api = {};

    for (const { init, api, name } of TOOLS) {
        init?.(isGM);

        if (typeof api === "object") {
            module.api[name] = api;
        }
    }
});

Hooks.once("ready", () => {
    const isGM = game.user.isGM;

    for (const { ready } of TOOLS) {
        ready?.(isGM);
    }
});

Hooks.on("renderSettingsConfig", onRenderSettingsConfig);
