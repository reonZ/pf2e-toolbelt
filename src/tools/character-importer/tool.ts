import {
    ActorPF2e,
    CharacterPF2e,
    CharacterSheetPF2e,
    createHTMLElement,
    createToggleableHook,
    FlagData,
    htmlQuery,
    renderCharacterSheets,
} from "module-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";
import { createSheetContent, ImportDataModel, removeSheetContent } from ".";

const ENABLED_SETTING = ["disabled", "gm", "all"] as const;

class CharacterImporterTool extends ModuleTool<ToolSettings> {
    #sheetRenderHook = createToggleableHook(
        "renderCharacterSheetPF2e",
        this.#onRenderCharacterSheetPF2e.bind(this)
    );

    get key(): "characterImporter" {
        return "characterImporter";
    }

    get settingsSchema(): ToolSettingsList<ToolSettings> {
        return [
            {
                key: "enabled",
                type: String,
                default: "disabbled",
                choices: ENABLED_SETTING,
                scope: "world",
                // TODO remove when/if released
                config: false,
                onChange: (value: ToolSettings["enabled"]) => {
                    this.#sheetRenderHook.toggle(
                        value === "all" || (value === "gm" && game.user.isGM)
                    );
                    renderCharacterSheets();
                },
            },
        ];
    }

    init(isGM: boolean): void {
        const enabled = this.settings.enabled;

        this.#sheetRenderHook.toggle(enabled === "all" || (enabled === "gm" && isGM));
    }

    getImportData(actor: ActorPF2e): FlagData<ImportDataModel> | undefined {
        return this.getDataFlag(actor, ImportDataModel, "data", { strict: true });
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

            this.setInMemory(actor, "importing", importing);

            if (importing) {
                createSheetContent.call(this, actor, html);
            } else {
                removeSheetContent(html);
            }
        });
    }
}

type ToolSettings = {
    enabled: (typeof ENABLED_SETTING)[number];
};

export { CharacterImporterTool };
