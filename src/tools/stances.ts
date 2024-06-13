import {
    addListenerAll,
    createHTMLElement,
    elementDataset,
    getItemWithSourceId,
    hasItemWithSourceId,
    htmlQuery,
    isInstanceOf,
    isOwner,
    renderCharacterSheets,
} from "foundry-pf2e";
import { createTool } from "../tool";
import {
    CHARACTER_SHEET_ACTIVATE_LISTENERS,
    CHARACTER_SHEET_RENDER_INNER,
} from "./shared/characterSheet";

const OPENING_STANCE = [
    "Compendium.pf2e.feats-srd.Item.yeSyGnYDkl2GUNmu",
    "Compendium.pf2e.feats-srd.Item.LI9VtCaL5ZRk0Wo8",
];

const REPLACERS = new Map([
    [
        "Compendium.pf2e.feats-srd.Item.nRjyyDulHnP5OewA", // gorilla pound

        {
            replace: "Compendium.pf2e.feats-srd.Item.DqD7htz8Sd1dh3BT", // gorilla stance
            effect: "Compendium.pf2e.feat-effects.Item.UZKIKLuwpQu47feK",
        },
    ],
]);

const EXTRAS = new Map([
    [
        "Compendium.pf2e.classfeatures.Item.09iL38CZZEa0q0Mt", // arcane cascade
        {
            effect: "Compendium.pf2e.feat-effects.Item.fsjO5oTKttsbpaKl",
            action: "Compendium.pf2e.actionspf2e.Item.HbejhIywqIufrmVM",
        },
    ],
    [
        "Compendium.pf2e.feats-srd.Item.xQuNswWB3eg1UM28", // cobra envenom
        {
            effect: "Compendium.pf2e.feat-effects.Item.2Qpt0CHuOMeL48rN",
        },
    ],
    [
        "Compendium.pf2e.feats-srd.Item.R7c4PyTNkZb0yvoT", // dread marshal
        {
            effect: "Compendium.pf2e.feat-effects.Item.qX62wJzDYtNxDbFv", // the stance aura
        },
    ],
    [
        "Compendium.pf2e.feats-srd.Item.bvOsJNeI0ewvQsFa", // inspiring marshal
        {
            effect: "Compendium.pf2e.feat-effects.Item.er5tvDNvpbcnlbHQ", // the stance aura
        },
    ],
]);

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
    this: CharacterSheetPF2e,
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

function characterSheetPF2eActivateListeners(this: CharacterSheetPF2e, html: HTMLElement) {
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

function onDeleteCombatant(combatant: CombatantPF2e) {
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

    const html = await waitDialog("opening", {
        yes: "fa-solid fa-person-running",
        data: {
            stances,
            actor,
        },
    });

    const effectUUID = html
        ? htmlQuery<HTMLInputElement>(html, "[name='stance']:checked")?.value
        : stances[0].effectUUID;

    if (!effectUUID) return;
    addStance(actor, effectUUID);
}

async function toggleStance(actor: CharacterPF2e, effectUUID: string, force?: boolean) {
    if (!force && !canUseStances(actor)) {
        localize.warn("error.noCombat");
        return;
    }

    const effects = getStanceEffects(actor);
    const effect = effects.find((stance) => stance.effectUUID === effectUUID);

    if (!effect) {
        await addStance(actor, effectUUID);
    }

    if (effects.length) {
        actor.deleteEmbeddedDocuments(
            "Item",
            effects.map(({ effectID }) => effectID)
        );
    }
}

function getStanceEffects(actor: CharacterPF2e) {
    const stances = getStances(actor);
    return stances.filter((stance): stance is StanceDataWithEffect => !!stance.effectID);
}

async function addStance(actor: CharacterPF2e, effectUUID: string) {
    const effect = await fromUuid(effectUUID);
    if (!isInstanceOf(effect, "EffectPF2e")) return;

    const source = effect.toObject();
    foundry.utils.setProperty(source, "flags.core.sourceId", effectUUID);
    foundry.utils.setProperty(source, "_stats.compendiumSource", effectUUID);

    const [item] = await actor.createEmbeddedDocuments("Item", [source]);
    item?.toMessage();
}

function canUseStances(actor: CharacterPF2e) {
    return actor.getActiveTokens(true, true).some((token) => token.inCombat);
}

function getEncounterTab(html: HTMLElement) {
    return htmlQuery(
        html,
        ".sheet-content [data-tab=actions] .tab-content .actions-panels [data-tab=encounter]"
    );
}

function getStances(actor: CharacterPF2e) {
    const stances: toolbelt.stances.StanceData[] = [];
    const replaced = new Set<string>();

    for (const feat of actor.itemTypes.feat) {
        const uuid = feat.sourceId;
        if (!uuid) continue;

        const replacer = REPLACERS.get(uuid);
        const extra = EXTRAS.get(uuid);
        if (!replacer && !extra && !isValidStance(feat)) continue;

        const effectUUID = replacer?.effect ?? extra?.effect ?? feat.system.selfEffect!.uuid;
        const effect = fromUuidSync<EffectPF2e | CompendiumIndexData>(effectUUID);
        if (!effect) continue;

        if (replacer?.replace) {
            replaced.add(replacer.replace);
        }

        const existingEffect = getItemWithSourceId(actor, effectUUID, "effect");
        const foundAction =
            (extra?.action && getItemWithSourceId(actor, extra.action, "action")) || feat;

        stances.push({
            name: (replacer && fromUuidSync(replacer.replace)?.name) ?? feat.name,
            itemName: feat.name,
            uuid,
            img: effect.img,
            effectUUID,
            effectID: existingEffect?.id,
            actionUUID: foundAction.sourceId!,
            actionID: foundAction.id,
        });
    }

    return stances.filter(({ uuid }) => !replaced.has(uuid));
}

function isValidStance(stance: ItemPF2e): stance is FeatPF2e {
    return (
        stance.isOfType("feat") &&
        stance.system.traits.value.includes("stance") &&
        !!stance.system.selfEffect?.uuid
    );
}

type StanceData = toolbelt.stances.StanceData;

type StanceDataWithEffect = Omit<StanceData, "effectID"> & { effectID: string };

export { config as stancesTool };
