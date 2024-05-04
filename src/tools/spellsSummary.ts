import {
    addListener,
    addListenerAll,
    beforeHTMLFromString,
    getActiveModule,
    getSummarizedSpellsDataForRender,
    isPlayedActor,
    querySelector,
    renderCharacterSheets,
} from "pf2e-api";
import { createTool } from "../tool";
import {
    CHARACTER_SHEET_ACTIVATE_LISTENERS,
    CHARACTER_SHEET_RENDER_INNER,
} from "./shared/characterSheet";

const { config, settings, wrappers, localize, render } = createTool({
    name: "spellsSummary",
    settings: [
        {
            key: "enabled",
            type: Boolean,
            default: false,
            scope: "client",
            onChange: (value) => {
                wrappers.toggleAll(value);
                renderCharacterSheets();
            },
        },
        {
            key: "sort",
            type: Boolean,
            default: false,
            scope: "client",
            onChange: renderCharacterSheets,
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
    ready: () => {
        wrappers.toggleAll(settings.enabled);
    },
} as const);

async function characterSheetPF2eRenderInner(
    this: CharacterSheetPF2e,
    html: HTMLElement,
    data: CharacterSheetData
) {
    const actor = this.actor;

    const entries = Object.values(data.spellCollectionGroups).flat();
    const summarizedData = await getSummarizedSpellsDataForRender(
        actor,
        settings.sort,
        localize.path,
        entries
    );
    const tab = await render("sheet", summarizedData);
    const nav = `<a data-tab="spells-summary" 
    data-group="spell-collections">Spell Summary</a>`;
    const spellcastingTab = getSpellcastingTab(html);
    const knownSpellsTab = querySelector(spellcastingTab, ".tab[data-tab='known-spells']");
    const knownSpellsNav = querySelector(spellcastingTab, "nav [data-tab='known-spells']");

    beforeHTMLFromString(knownSpellsNav, nav);
    beforeHTMLFromString(knownSpellsTab, tab);
}

function characterSheetPF2eActivateListeners(this: CharacterSheetPF2e, html: HTMLElement) {
    const actor = this.actor;

    addListener(html, "nav.sheet-navigation .item[data-tab='spellcasting']", (event, el) =>
        toggleSpellcastingTab.call(this, html, el)
    );

    const pf2eDailies = getActiveModule<PF2eDailiesModule>("pf2e-dailies");
    if (!pf2eDailies) return;

    const spellcastingTab = getSpellcastingTab(html);
    const spellsSummaryTab = querySelector(spellcastingTab, ".tab.spells-summary");

    addListenerAll(
        spellsSummaryTab,
        "[data-action='update-staff-charges']",
        "change",
        (event, el: HTMLInputElement) => {
            const value = el.valueAsNumber;
            pf2eDailies.api.setStaffChargesValue(actor, value);
        }
    );

    addListenerAll(spellsSummaryTab, "[data-action='reset-staff-charges']", () => {
        pf2eDailies.api.setStaffChargesValue(actor);
    });
}

function toggleSpellcastingTab(this: CharacterSheetPF2e, html: HTMLElement, navIcon: HTMLElement) {
    if (!navIcon.classList.contains("active")) return;

    const spellcastingTab = getSpellcastingTab(html);
    const spellcastingNav = querySelector(spellcastingTab, "nav");
    const isActive = querySelector(
        spellcastingNav,
        "[data-tab='spells-summary']"
    ).classList.contains("active");

    const tabName = isActive ? "known-spells" : "spells-summary";
    this.activateTab(tabName, { group: "spell-collections" });
}

function getSpellcastingTab(html: HTMLElement) {
    return querySelector(html, ".sheet-content .tab[data-tab='spellcasting']");
}

export { config as spellsSummaryTool };
