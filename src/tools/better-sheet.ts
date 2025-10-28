import {
    ActorPF2e,
    ActorSheetPF2e,
    belongToPartyAlliance,
    CharacterPF2e,
    CharacterSheetPF2e,
    createHTMLElement,
    createToggleableHook,
    createToggleableWrapper,
    CreatureSheetData,
    FamiliarPF2e,
    FamiliarSheetPF2e,
    htmlQuery,
    NPCSheetPF2e,
    renderActorSheets,
    renderCharacterSheets,
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

    #renderActorSheetHook = createToggleableHook(
        "renderActorSheetPF2e",
        this.#onRenderActorSheetPF2e.bind(this)
    );

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
                onChange: (value: boolean) => {
                    toggleHooksAndWrappers(this.#partyAsObservedHooks, !game.user.isGM && value);
                },
            },
            {
                key: "showPlayers",
                type: Boolean,
                default: false,
                scope: "user",
                gmOnly: true,
                onChange: (value: boolean) => {
                    this.#renderActorSheetHook.toggle(game.user.isGM && value);
                    renderActorSheets();
                },
            },
            {
                key: "scribble",
                type: Boolean,
                default: false,
                scope: "user",
                // TODO this goes away once the feature is released
                config: false,
                onChange: (value: boolean) => {
                    document.body.classList.toggle("pf2e-toolbelt-scribble", value);
                    renderCharacterSheets();
                },
            },
        ];
    }

    init(isGM: boolean): void {
        document.body.classList.toggle("pf2e-toolbelt-scribble", this.settings.scribble);

        if (isGM) {
            this.#renderActorSheetHook.toggle(this.settings.showPlayers);
        }
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

    #onRenderActorSheetPF2e(sheet: ActorSheetPF2e<ActorPF2e>, $html: JQuery) {
        const html = $html[0];
        const imgPanel = htmlQuery(html, ".image-container");
        if (!imgPanel) return;

        const actor = sheet.actor;
        const btn = createHTMLElement("a", {
            classes: ["hover-icon", "show-players"],
            content: `<i class="fa-fw fa-solid fa-eye"></i></a>`,
            dataset: {
                tooltip: "JOURNAL.ActionShow",
            },
        });

        btn.addEventListener("click", () => {
            game.socket.emit("shareImage", {
                image: actor.img,
                title: "test title",
                uuid: actor.uuid,
            });

            ui.notifications.info("JOURNAL.ActionShowSuccess", {
                format: { mode: "image", title: actor.name, which: "all" },
            });
        });

        imgPanel.appendChild(btn);
    }
}

type ToolSettings = {
    scribble: boolean;
    showPlayers: boolean;
    partyAsObserved: boolean;
};

export { BetterSheetTool };
