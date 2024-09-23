import { ErrorPF2e } from "foundry-pf2e";
import { createTool } from "../tool";

const BESTIARY_SOURCES = ["pathfinder-bestiary", "pathfinder-bestiary-2", "pathfinder-bestiary-3"];

const { config, settings, wrapper } = createTool({
    name: "betterBrowser",
    settings: [
        {
            key: "noDuplicates",
            type: Boolean,
            default: false,
            onChange: (value: boolean) => {
                wrapper.toggle(value);
                game.pf2e.compendiumBrowser.render();
            },
        },
    ],
    wrappers: [
        {
            key: "browserEquipmentTabRenderResults",
            path: "game.pf2e.compendiumBrowser.tabs.bestiary.constructor.prototype.renderResults",
            callback: browserBestiaryTabRenderResults,
            type: "OVERRIDE",
        },
    ],
    ready: () => {
        if (settings.noDuplicates) {
            wrapper.activate();
        }
    },
} as const);

function browserBestiaryTabGetIndexData(
    this: CompendiumBrowserBestiaryTab,
    start: number
): CompendiumBrowserBestiaryTabIndexData[] {
    if (!this.isInitialized) {
        throw ErrorPF2e(`Compendium Browser Tab "${this.tabName}" is not initialized!`);
    }

    this.currentIndex = (() => {
        const searchText = SearchFilter.cleanQuery(this.filterData.search.text);
        if (searchText) {
            const searchResult = this.searchEngine.search(searchText);
            return this.sortResult(searchResult.filter(this.filterIndexData.bind(this)));
        }
        return this.sortResult(this.indexData.filter(this.filterIndexData.bind(this)));
    })();

    this.totalItemCount = this.currentIndex.length;

    const limit = Math.min(this.currentIndex.length, start + this.scrollLimit + 1);
    const indexData: CompendiumBrowserBestiaryTabIndexData[] = [];

    const getName = (entry: CompendiumBrowserBestiaryTabIndexData) => {
        return entry.originalName ?? entry.name;
    };

    for (let i = start; i < limit - 1; i++) {
        const data = this.currentIndex[i];

        if (!BESTIARY_SOURCES.includes(data.source)) {
            indexData.push(data);
            continue;
        }

        const nextData = this.currentIndex[i + 1];

        if (nextData.source !== "pathfinder-monster-core" || getName(data) !== getName(nextData)) {
            indexData.push(data);
        }
    }

    return indexData;
}

async function browserBestiaryTabRenderResults(
    this: CompendiumBrowserBestiaryTab,
    start: number
): Promise<HTMLLIElement[]> {
    if (!this.templatePath) {
        throw ErrorPF2e(`Tab "${this.tabName}" has no valid template path.`);
    }

    const domParser = new DOMParser();
    const indexData = browserBestiaryTabGetIndexData.call(this, start);
    const liElements: HTMLLIElement[] = [];

    for (const entry of indexData) {
        const htmlString = await renderTemplate(this.templatePath, {
            entry,
            filterData: this.filterData,
        });
        const html = domParser.parseFromString(htmlString, "text/html");
        liElements.push(html.body.firstElementChild as HTMLLIElement);
    }

    return liElements;
}

export { config as betterBrowserTool };
