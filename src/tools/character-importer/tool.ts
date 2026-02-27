import {
    CharacterPF2e,
    CharacterSheetPF2e,
    createHTMLElement,
    createToggleHook,
    htmlQuery,
    MODULE,
    renderCharacterSheets,
} from "foundry-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";
import { CharacterImport, CharacterImportSource, createSheetContent, MENU_TYPES, removeSheetContent } from ".";

const ENABLED_SETTING = ["disabled", "gm", "all"] as const;

class CharacterImporterTool extends ModuleTool<ToolSettings> {
    #loaded = false;
    #sheetRenderHook = createToggleHook("renderCharacterSheetPF2e", this.#onRenderCharacterSheetPF2e.bind(this));

    get key(): "characterImporter" {
        return "characterImporter";
    }

    get settingsSchema(): ToolSettingsList<ToolSettings> {
        return [
            {
                key: "enabled",
                type: String,
                default: "disabled",
                choices: ENABLED_SETTING,
                scope: "world",
                // TODO remove when/if released
                config: false,
                onChange: async (value: ToolSettings["enabled"]) => {
                    const activate = value === "all" || (value === "gm" && game.user.isGM);

                    this.#sheetRenderHook.toggle(activate);

                    if (activate) {
                        await this.#loadTemplates();
                    }

                    renderCharacterSheets();
                },
            },
        ];
    }

    init(isGM: boolean): void {
        const enabled = this.settings.enabled;
        const activate = enabled === "all" || (enabled === "gm" && isGM);

        if (activate) {
            this.#loadTemplates();
        }

        this.#sheetRenderHook.toggle(activate);
    }

    async getImportData(actor: CharacterPF2e, sourceOnly: true): Promise<CharacterImportSource | undefined>;
    async getImportData(actor: CharacterPF2e, sourceOnly?: boolean): Promise<CharacterImport | undefined>;
    async getImportData(actor: CharacterPF2e, sourceOnly?: boolean) {
        const source = this.getFlag<CharacterImportSource>(actor, "data");
        const model = await CharacterImport.fromSource(source ?? {});
        return sourceOnly ? model?.encode() : model;
    }

    setImportData(actor: CharacterPF2e, data: CharacterImport): Promise<CharacterPF2e> | undefined {
        const encoded = data.encode();
        return encoded ? this.setFlag(actor, "==data", encoded) : undefined;
    }

    fullTemplatePath(...path: string[]): string {
        return MODULE.templatePath(this.templatePath(...path));
    }

    async #loadTemplates(): Promise<Handlebars.TemplateDelegate[] | undefined> {
        if (this.#loaded) return;

        this.#loaded = true;

        const templates = MENU_TYPES.map((path) => this.fullTemplatePath(path));
        return foundry.applications.handlebars.loadTemplates(templates.flat());
    }

    #onRenderCharacterSheetPF2e(sheet: CharacterSheetPF2e<CharacterPF2e>, $html: JQuery) {
        if (!sheet.isEditable) return;

        const html = $html[0];
        const actor = sheet.actor;
        const levelEl = htmlQuery(html, ".char-header .char-level");
        const cancelTooltip = this.localize("sheet.level.cancel");
        const importTooltip = this.localize("sheet.level.import");

        const btn = createHTMLElement("a", {
            classes: ["character-importer"],
            content: `<i class="cancel fa-solid fa-ban" data-tooltip="${cancelTooltip}"></i>
            <i class="import fa-solid fa-download" data-tooltip="${importTooltip}"></i>`,
        });

        if (this.getInMemory(actor, "importing")) {
            sheet.form.classList.add("importing-character");
            createSheetContent.call(this, actor, html);
        }

        levelEl?.appendChild(btn);

        btn.addEventListener("click", () => {
            const importing = sheet.form.classList.toggle("importing-character");

            if (importing) {
                this.setInMemory(actor, "importing", true);
                createSheetContent.call(this, actor, html);
            } else {
                this.deleteInMemory(actor, "importing");
                this.deleteInMemory(actor, "tab");
                removeSheetContent(html);
            }
        });
    }
}

type ToolSettings = {
    enabled: (typeof ENABLED_SETTING)[number];
};

export { CharacterImporterTool };
