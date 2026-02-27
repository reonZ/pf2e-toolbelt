import { CharacterPF2e, R } from "foundry-helpers";
import { CharacterImport, CharacterImporterTool } from "tools";
import { prepareCoreTab, prepareSkillsTab } from ".";

const MENU = [
    { type: "core", icon: "fa-solid fa-address-card" },
    { type: "skills", icon: "fa-solid fa-hand" },
    { type: "feats", icon: "fa-solid fa-medal" },
    { type: "spells", icon: "fa-solid fa-wand-magic-sparkles" },
    { type: "inventory", icon: "fa-solid fa-box-open" },
    { type: "details", icon: "fa-solid fa-book-reader" },
] as const;

const MENU_TYPES = R.map(MENU, ({ type }) => type);

async function prepareContext(
    this: CharacterImporterTool,
    actor: CharacterPF2e,
    data: CharacterImport | undefined,
): Promise<ImportDataContext | Pick<ImportDataContext, "partial">> {
    if (!data) {
        return {
            partial: (key: string) => this.fullTemplatePath(key),
        };
    }

    const tabs: ImportDataContext["tabs"] = {
        core: await prepareCoreTab.call(this, actor, data),
        details: {},
        feats: {},
        inventory: {},
        skills: await prepareSkillsTab.call(this, actor, data),
        spells: {},
    };

    return {
        hasData: true,
        menu: MENU,
        partial: (key: string) => this.fullTemplatePath(key),
        tabs,
    };
}

type ImportDataContext = {
    hasData: true;
    menu: typeof MENU;
    partial: (key: string) => string;
    tabs: Record<ImportMenuType, Record<string, any>>;
};

type ImportMenuType = (typeof MENU)[number]["type"];

export { MENU_TYPES, prepareContext };
export type { ImportMenuType };
