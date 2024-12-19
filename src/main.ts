import { getSetting, MODULE, R, userIsGM } from "module-helpers";
import { onRenderSettingsConfig, registerToolsSettings } from "./settings";
import type { ToolConfig } from "./tool";
import { actionableTool } from "./tools/actionable";
import { arpTool } from "./tools/arp";
import { betterMerchantTool } from "./tools/betterMerchant";
import { debugTool } from "./tools/debug";
import { effectsPanelTool } from "./tools/effectsPanel";
import { givethTool } from "./tools/giveth";
import { heroActionsTool } from "./tools/heroActions";
import { hideDamageTool } from "./tools/hideDamage";
import { identifyTool } from "./tools/identify";
import { mergeDamageTool } from "./tools/mergeDamage";
import { noBulkTool } from "./tools/noBulk";
import { ShareTool } from "./tools/share";
import { spellsSummaryTool } from "./tools/spellsSummary";
import { stancesTool } from "./tools/stances";
import { targetHelperTool } from "./tools/targetHelper";
import { templateHelperTool } from "./tools/templateHelper";
import { undergroundTool } from "./tools/underground";
import { unidedTool } from "./tools/unided";
import { untargetTool } from "./tools/untarget";
import { useButtonTool } from "./tools/useButton";
import { ModuleMigration } from "module-helpers/dist/migration";
import { droppethTool } from "./tools/droppeth";

MODULE.register("pf2e-toolbelt");

const TOOLS: ToolConfig[] = [
    actionableTool,
    arpTool,
    betterMerchantTool,
    debugTool,
    untargetTool,
    droppethTool,
    effectsPanelTool,
    givethTool,
    heroActionsTool,
    hideDamageTool,
    identifyTool,
    mergeDamageTool,
    noBulkTool,
    ShareTool,
    unidedTool,
    spellsSummaryTool,
    stancesTool,
    targetHelperTool,
    templateHelperTool,
    undergroundTool,
    useButtonTool,
];

{
    const migrations = R.pipe(
        TOOLS,
        R.flatMap((tool) => tool.migrations ?? []),
        R.groupBy(R.prop("version"))
    );

    for (const [version, entries] of R.entries(migrations)) {
        if (!entries.length) continue;

        const migration: Omit<ModuleMigration, "module"> = {
            version: Number(version),
        };

        for (const functionName of ["migrateActor", "migrateUser"] as const) {
            const migrateFunctions = R.pipe(
                entries,
                R.map((entry) => entry[functionName]),
                R.filter(R.isTruthy)
            );

            if (!migrateFunctions.length) continue;

            migration[functionName] = async (source) => {
                let migrated = false;

                for (const migrateFunction of migrateFunctions) {
                    if (await migrateFunction(source as any)) {
                        migrated = true;
                    }
                }

                return migrated;
            };
        }

        MODULE.registerMigration(migration);
    }
}

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

    // @ts-ignore
    game.toolbelt = Object.defineProperties(
        {},
        {
            api: {
                value: module.api,
                writable: false,
                configurable: false,
                enumerable: false,
            },
            active: {
                get: function () {
                    return MODULE.current.active;
                },
                configurable: false,
                enumerable: false,
            },
            getToolSetting: {
                value: function (name: string, setting: string) {
                    return this.active ? getSetting(`${name}.${setting}`) : undefined;
                },
                writable: false,
                configurable: false,
                enumerable: false,
            },
        }
    );
});

Hooks.once("ready", () => {
    const isGM = game.user.isGM;

    for (const { ready } of TOOLS) {
        ready?.(isGM);
    }
});

Hooks.on("renderSettingsConfig", onRenderSettingsConfig);
