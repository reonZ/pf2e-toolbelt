import { CharacterImport, CharacterImporterTool } from "tools";
import { ImportDataCoreContext, prepareCoreTab } from ".";
import { CharacterPF2e, R } from "foundry-helpers";

const MENU = [
    { type: "core", icon: "fa-solid fa-address-card" },
    { type: "feats", icon: "fa-solid fa-medal" },
    { type: "inventory", icon: "fa-solid fa-box-open" },
    { type: "skills", icon: "fa-solid fa-hand" },
    { type: "spells", icon: "fa-solid fa-wand-magic-sparkles" },
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

    const core = await prepareCoreTab.call(this, actor, data);

    return {
        core,
        hasData: true,
        menu: MENU,
        partial: (key: string) => this.fullTemplatePath(key),
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
