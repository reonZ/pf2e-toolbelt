import { MAPPED_TOOLS } from "main";
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
    PhysicalItemType,
    R,
    renderActorSheets,
    renderCharacterSheets,
    sortByLocaleCompare,
    splitStr,
    toggleHooksAndWrappers,
} from "module-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";
import { BetterMerchantTool } from "./better-merchant";

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

    #showPlayersHook = createToggleableHook(
        "renderActorSheetPF2e",
        this.#showPlayersOnRender.bind(this)
    );

    #sortListHook = createToggleableHook("renderActorSheetPF2e", this.#sortListOnRender.bind(this));

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
            {
                key: "showPlayers",
                type: Boolean,
                default: false,
                scope: "user",
                gmOnly: true,
                onChange: (value: boolean) => {
                    if (game.user.isGM) {
                        this.#showPlayersHook.toggle(value);
                        renderActorSheets();
                    }
                },
            },
            {
                key: "sortList",
                type: Boolean,
                default: false,
                scope: "user",
                onChange: (value: boolean) => {
                    this.#sortListHook.toggle(value);
                    renderActorSheets();
                },
            },
        ];
    }

    init(isGM: boolean): void {
        document.body.classList.toggle("pf2e-toolbelt-scribble", this.settings.scribble);

        this.#showPlayersHook.toggle(isGM && this.settings.showPlayers);
        this.#sortListHook.toggle(this.settings.sortList);
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

    #showPlayersOnRender(sheet: ActorSheetPF2e<ActorPF2e>, $html: JQuery) {
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

    #sortListOnRender(sheet: ActorSheetPF2e<ActorPF2e>, $html: JQuery) {
        if (!sheet.isEditable) return;

        const html = $html[0];
        const actor = sheet.actor;

        this.#addinventorySortList(html, actor);
    }

    #addinventorySortList(html: HTMLElement, actor: ActorPF2e) {
        const isLoot = actor.isOfType("loot");
        const inventorySelector = isLoot ? ".sheet-body.inventory" : `.tab[data-tab="inventory"]`;
        const inventory = htmlQuery(html, inventorySelector + " .inventory-list");
        if (!inventory) return;

        const headers = inventory.querySelectorAll(":scope > header");

        for (const header of headers) {
            const itemsList = header.nextElementSibling as HTMLElement | undefined;
            if (!itemsList || !itemsList.classList.contains("items")) continue;

            const hasItems = itemsList.children.length > 0;
            const name = htmlQuery(header, ".item-name");
            const btn = createHTMLElement("a", {
                classes: hasItems ? [] : ["disabled"],
                content: `<i class="fa-solid fa-arrow-up-a-z"></i>`,
                dataset: {
                    tooltip: this.localizePath("sortList.sheet.tooltip"),
                },
            });

            name?.prepend(btn);
            if (!hasItems) continue;

            btn.addEventListener("click", async () => {
                if (isLoot && header.classList.contains("services")) {
                    const tool = MAPPED_TOOLS.betterMerchant as BetterMerchantTool;
                    const services = tool.getServices(actor);

                    sortByLocaleCompare(services, "label");
                    await services.setFlag();
                    return;
                }

                const types = splitStr<PhysicalItemType>(itemsList.dataset.itemTypes ?? "");
                const items = R.pipe(
                    types,
                    R.map((type) => type in actor.itemTypes && actor.itemTypes[type]),
                    R.filter(R.isTruthy),
                    R.flat(),
                    R.sort((a, b) => a._source.name.localeCompare(b._source.name))
                );

                const updates = items.map((item, index) => {
                    return { _id: item.id, sort: 50000 * index };
                });

                await actor.updateEmbeddedDocuments("Item", updates);
            });
        }
    }
}

type ToolSettings = {
    scribble: boolean;
    showPlayers: boolean;
    sortList: boolean;
    partyAsObserved: boolean;
};

export { BetterSheetTool };
