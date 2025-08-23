import {
    belongToPartyAlliance,
    CharacterPF2e,
    CharacterSheetPF2e,
    createToggleableWrapper,
    CreatureSheetData,
    FamiliarPF2e,
    FamiliarSheetPF2e,
    NPCSheetPF2e,
    toggleHooksAndWrappers,
} from "module-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";

class BetterSheetTool extends ModuleTool<ToolSettings> {
    #partyAsObservedHooks = [
        createToggleableWrapper(
            "OVERRIDE",
            "CONFIG.Actor.sheetClasses.character['pf2e.CharacterSheetPF2e'].cls.prototype.template",
            this.#characterSheetPF2eTemplate,
            { context: this }
        ),
        createToggleableWrapper(
            "OVERRIDE",
            "CONFIG.Actor.sheetClasses.npc['pf2e.NPCSheetPF2e'].cls.prototype.template",
            this.#npcSheetPF2eTemplate,
            { context: this }
        ),
        createToggleableWrapper(
            "WRAPPER",
            "CONFIG.Actor.sheetClasses.familiar['pf2e.FamiliarSheetPF2e'].cls.prototype.getData",
            this.#familiarSheetPF2eGetData,
            { context: this }
        ),
    ];

    get key(): "betterSheet" {
        return "betterSheet";
    }

    get settingsSchema(): ToolSettingsList<ToolSettings> {
        return [
            {
                key: "partyAsObserved",
                type: Boolean,
                default: false,
                scope: "world",
                onChange: (value) => {
                    toggleHooksAndWrappers(this.#partyAsObservedHooks, !game.user.isGM && value);
                },
            },
        ];
    }

    ready(isGM: boolean): void {
        toggleHooksAndWrappers(this.#partyAsObservedHooks, !isGM && this.settings.partyAsObserved);
    }

    #npcSheetPF2eTemplate(sheet: NPCSheetPF2e): string {
        if (sheet.isLootSheet) {
            return "systems/pf2e/templates/actors/npc/loot-sheet.hbs";
        } else if (sheet.actor.limited && !belongToPartyAlliance(sheet.actor)) {
            return "systems/pf2e/templates/actors/limited/npc-sheet.hbs";
        }
        return "systems/pf2e/templates/actors/npc/sheet.hbs";
    }

    #characterSheetPF2eTemplate(sheet: CharacterSheetPF2e<CharacterPF2e>): string {
        const actor = sheet.actor;
        const template = actor.limited && !belongToPartyAlliance(actor) ? "limited" : "sheet";

        return `systems/pf2e/templates/actors/character/${template}.hbs`;
    }

    async #familiarSheetPF2eGetData(
        sheet: FamiliarSheetPF2e<FamiliarPF2e>,
        wrapped: libWrapper.RegisterCallback,
        options?: ActorSheetOptions
    ): Promise<CreatureSheetData<FamiliarPF2e>> {
        const data = (await wrapped(options)) as CreatureSheetData<FamiliarPF2e>;

        if (belongToPartyAlliance(sheet.actor)) {
            data.limited = false;
            data.document = data.document.clone();

            Object.defineProperty(data.document, "limited", {
                get() {
                    return false;
                },
            });
        }

        return data;
    }
}

type ToolSettings = {
    partyAsObserved: boolean;
};

export { BetterSheetTool };
