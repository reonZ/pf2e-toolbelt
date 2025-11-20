import { CharacterImporterTool, ImportDataModel } from "tools";
import { CharacterPF2e } from "module-helpers";
import { ImportDataCoreContext, prepareCoreTab } from ".";

const MENU = [
    { type: "core", icon: "fa-solid fa-address-card" },
    { type: "feats", icon: "fa-solid fa-medal" },
    { type: "inventory", icon: "fa-solid fa-box-open" },
    { type: "skills", icon: "fa-solid fa-hand" },
    { type: "spells", icon: "fa-solid fa-wand-magic-sparkles" },
    { type: "details", icon: "fa-solid fa-book-reader" },
] as const;

const MENU_TYPES = MENU.map(({ type }) => type);

async function prepareContext(
    this: CharacterImporterTool,
    actor: CharacterPF2e,
    data: ImportDataModel | undefined
): Promise<ImportDataContext | Pick<ImportDataContext, "partial">> {
    if (!data) {
        return {
            partial: (key: string) => this.templatePath(key),
        };
    }

    const core = await prepareCoreTab.call(this, actor, data);

    return {
        core,
        hasData: true,
        menu: MENU,
        partial: (key: string) => this.templatePath(key),
    };
}

type ImportDataContext = {
    core: ImportDataCoreContext;
    hasData: true;
    menu: typeof MENU;
    partial: (key: string) => string;
};

type ImportMenuType = (typeof MENU)[number]["type"];

export { MENU_TYPES, prepareContext };
export type { ImportMenuType };
