import {
    CharacterPF2e,
    CharacterSheetData,
    CharacterSheetPF2e,
    CombatantPF2e,
    addListenerAll,
    addStance,
    canUseStances,
    createHTMLElement,
    elementDataset,
    getStanceEffects,
    getStances,
    hasItemWithSourceId,
    htmlQuery,
    isOwner,
    isValidStance,
    renderCharacterSheets,
    toggleStance as toggleActorStance,
} from "module-helpers";
import { createTool } from "../tool";
import {
    CHARACTER_SHEET_ACTIVATE_LISTENERS,
    CHARACTER_SHEET_RENDER_INNER,
} from "./shared/characterSheet";

const OPENING_STANCE = [
    "Compendium.pf2e.feats-srd.Item.yeSyGnYDkl2GUNmu",
    "Compendium.pf2e.feats-srd.Item.LI9VtCaL5ZRk0Wo8",
];

const { config, settings, hooks, wrappers, localize, render, waitDialog } = createTool({
    name: "stances",
    settings: [
        {
            key: "enabled",
            type: Boolean,
            default: false,
            scope: "client",
            onChange: (value) => {
                hooks.toggleAll(value);
                wrappers.toggleAll(value);
                renderCharacterSheets();
            },
        },
    ],
    hooks: [
        {
            event: "preDeleteCombatant",
            listener: onPreDeleteCombatant,
        },
        {
            event: "createCombatant",
            listener: onCreateCombatant,
        },
        {
            event: "deleteCombatant",
            listener: onDeleteCombatant,
        },
        {
            event: "deleteCombat",
            listener: onDeleteCombatant,
        },
    ],
    wrappers: [
        {
            path: CHARACTER_SHEET_RENDER_INNER,
            callback: characterSheetPF2eRenderInner,
        },
        {
            path: CHARACTER_SHEET_ACTIVATE_LISTENERS,
            callback: characterSheetPF2eActivateListeners,
        },
    ],
    api: {
        canUseStances,
        getStances,
        isValidStance,
        toggleStance,
    },
    ready: () => {
        const enabled = settings.enabled;
        hooks.toggleAll(enabled);
        wrappers.toggleAll(enabled);
    },
} as const);

async function characterSheetPF2eRenderInner(
    this: CharacterSheetPF2e<CharacterPF2e>,
    html: HTMLElement,
    data: CharacterSheetData
) {
    const actor = this.actor;
    if (!actor.isOwner) return;

    const stances = getStances(actor);
    if (!stances.length) return;

    const dataset = canUseStances(actor) ? undefined : { tooltip: localize.path("sheet.noCombat") };
    const encounterTab = getEncounterTab(html);
    const sheetElement = createHTMLElement("div", {
        dataset,
        classes: ["pf2e-stances"],
        innerHTML: await render("sheet", { stances }),
    });

    htmlQuery(encounterTab, "header")?.before(sheetElement);
}

function characterSheetPF2eActivateListeners(
    this: CharacterSheetPF2e<CharacterPF2e>,
    html: HTMLElement
) {
    const actor = this.actor;
    if (!actor.isOwner) return;

    const encounterTab = getEncounterTab(html);
    if (!encounterTab) return;

    addListenerAll(encounterTab, ".pf2e-stances .stance", (event, el) => {
        const uuid = elementDataset(el).effectUuid;
        toggleStance(actor, uuid, event.ctrlKey);
    });
}

function onPreDeleteCombatant(combatant: CombatantPF2e) {
    const actor = combatant.actor;
    if (!actor?.isOfType("character")) return;

    const effects = getStanceEffects(actor);

    if (!effects.length) {
        actor.sheet.render();
        return;
    }

    actor.deleteEmbeddedDocuments(
        "Item",
        effects.map(({ effectID }) => effectID)
    );
}

function onDeleteCombatant() {
    renderCharacterSheets();
}

async function onCreateCombatant(combatant: CombatantPF2e) {
    const actor = combatant.actor;
    if (!actor?.isOfType("character")) return;

    if (game.user.isGM || !isOwner(actor)) {
        actor.sheet.render();
        return;
    }

    const stances = getStances(actor);
    if (!stances.length) return;

    const hasStancesEffects = stances.some(({ effectID }) => !!effectID);
    if (hasStancesEffects) return;

    const hasOpeningStanceFeat = hasItemWithSourceId(actor, OPENING_STANCE, "feat");
    if (!hasOpeningStanceFeat) return;

    if (stances.length === 1) {
        addStance(actor, stances[0].effectUUID);
        return;
    }

    const result = await waitDialog<{ stance: string }>("opening", {
        yes: "fa-solid fa-person-running",
        data: {
            stances,
            actor,
        },
    });

    if (result) {
        addStance(actor, result.stance);
    }
}

async function toggleStance(actor: CharacterPF2e, effectUUID: string, force?: boolean) {
    const error = await toggleActorStance(actor, effectUUID, force);

    switch (error) {
        case "no-combat":
            localize.warn("error.noCombat");
            break;
    }
}

function getEncounterTab(html: HTMLElement) {
    return htmlQuery(
        html,
        ".sheet-content [data-tab=actions] .tab-content .actions-panels [data-tab=encounter]"
    );
}

export { config as stancesTool };
