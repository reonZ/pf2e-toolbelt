import { EncounterPF2e } from "module-helpers";
import { createTool } from "../tool";

const debouncedSetup = foundry.utils.debounce(setup, 1);

const { config, settings, hook } = createTool({
    name: "untarget",
    settings: [
        {
            key: "force",
            type: Boolean,
            default: false,
            onChange: debouncedSetup,
        },
        {
            key: "enabled",
            type: Boolean,
            default: false,
            scope: "client",
            onChange: debouncedSetup,
        },
    ],
    hooks: [
        {
            event: "updateCombat",
            listener: onUpdateCombat,
        },
    ],
    init: setup,
} as const);

function setup() {
    hook.toggle(settings.force || settings.enabled);
}

function onUpdateCombat(combat: EncounterPF2e, data: Partial<foundry.documents.CombatSource>) {
    if (!("turn" in data) && !("round" in data)) return;

    const user = game.user;
    user.updateTokenTargets();
    user.broadcastActivity({ targets: [] });
}

export { config as untargetTool };
