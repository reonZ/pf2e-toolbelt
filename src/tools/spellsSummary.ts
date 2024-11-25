import {
    CharacterPF2e,
    CharacterSheetData,
    CharacterSheetPF2e,
    addListener,
    addListenerAll,
    createHTMLElement,
    getActiveModule,
    getSummarizedSpellsDataForRender,
    htmlQuery,
    renderCharacterSheets,
} from "module-helpers";
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
    this: CharacterSheetPF2e<CharacterPF2e>,
    html: HTMLElement,
    data: CharacterSheetData
) {
    const actor = this.actor;

    const entries = Object.values(data.spellCollectionGroups).flat();
    const summarizedData = await getSummarizedSpellsDataForRender(
        actor,
        settings.sort,
        {
            staff: localize.path("staff"),
            charges: localize.path("charges"),
        },
        entries
    );

    const spellcastingTab = getSpellcastingTab(html);
    const dataset = { tab: "spells-summary", group: "spell-collections" };

    const navElement = createHTMLElement("a", {
        dataset,
        innerHTML: localize("label"),
    });

    const tabElement = createHTMLElement("div", {
        dataset,
        classes: ["tab", "spells-summary"],
        innerHTML: await render("sheet", summarizedData),
    });

    htmlQuery(spellcastingTab, "nav [data-tab='known-spells']")?.before(navElement);
    htmlQuery(spellcastingTab, ".tab[data-tab='known-spells']")?.before(tabElement);
}

function characterSheetPF2eActivateListeners(
    this: CharacterSheetPF2e<CharacterPF2e>,
    html: HTMLElement
) {
    const actor = this.actor;

    addListener(html, "nav.sheet-navigation .item[data-tab='spellcasting']", (event, el) =>
        toggleSpellcastingTab.call(this, html, el)
    );

    const pf2eDailies = getActiveModule("pf2e-dailies");
    if (!pf2eDailies) return;

    const spellcastingTab = getSpellcastingTab(html);
    const spellsSummaryTab = htmlQuery(spellcastingTab, ".tab.spells-summary");
    if (!spellsSummaryTab) return;

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

function toggleSpellcastingTab(
    this: CharacterSheetPF2e<CharacterPF2e>,
    html: HTMLElement,
    navIcon: HTMLElement
) {
    if (!navIcon.classList.contains("active")) return;

    const spellcastingTab = getSpellcastingTab(html);
    const spellcastingNav = htmlQuery(spellcastingTab, "nav");
    const isActive = htmlQuery(spellcastingNav, "[data-tab='spells-summary']")?.classList.contains(
        "active"
    );

    const tabName = isActive ? "known-spells" : "spells-summary";
    this.activateTab(tabName, { group: "spell-collections" });
}

function getSpellcastingTab(html: HTMLElement) {
    return htmlQuery(html, ".sheet-content .tab[data-tab='spellcasting']");
}

export { config as spellsSummaryTool };
