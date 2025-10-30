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
    CreaturePF2e,
    CreatureSheetData,
    FamiliarPF2e,
    FamiliarSheetPF2e,
    htmlQuery,
    isInstanceOf,
    NPCSheetPF2e,
    PhysicalItemType,
    R,
    renderActorSheets,
    renderCharacterSheets,
    sortByLocaleCompare,
    SpellcastingEntryPF2e,
    SpellCollection,
    SpellPreparationSheet,
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

    #sortListHooks = [
        createToggleableHook("renderActorSheetPF2e", this.#sortListOnRender.bind(this)),
        createToggleableHook("renderSpellPreparationSheet", this.#addSpellbookSortList.bind(this)),
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
                    toggleHooksAndWrappers(this.#sortListHooks, value);
                    renderActorSheets();
                },
            },
        ];
    }

    init(isGM: boolean): void {
        document.body.classList.toggle("pf2e-toolbelt-scribble", this.settings.scribble);

        this.#showPlayersHook.toggle(isGM && this.settings.showPlayers);
        toggleHooksAndWrappers(this.#sortListHooks, this.settings.sortList);
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

        this.#addActionsSortList(html, actor);
        this.#addInventorySortList(html, actor);
        this.#addSpellcastingSortList(html, actor);
    }

    #createSortBtn(disabled: boolean) {
        const classes = ["with-sort-btn"];

        if (disabled) {
            classes.push("disabled");
        }

        return createHTMLElement("a", {
            classes,
            content: `<i class="fa-solid fa-arrow-up-a-z"></i>`,
            dataset: {
                tooltip: this.localizePath("sortList.sheet.tooltip"),
            },
        });
    }

    async #sortCollectionSpells(collection: SpellCollection<CreaturePF2e>) {
        const updates = R.pipe(
            collection.contents,
            R.groupBy((spell) => (spell.isCantrip ? 0 : spell.rank)),
            R.values(),
            R.flatMap((group) => {
                group.sort((a, b) => a._source.name.localeCompare(b._source.name));
                return group;
            }),
            R.map((item, index) => {
                return { _id: item.id, sort: 50000 * index };
            })
        );

        await collection.actor.updateEmbeddedDocuments("Item", updates);
    }

    async #sortPrepCollection(entry: SpellcastingEntryPF2e<CreaturePF2e>) {
        const actor = entry.actor;

        const updates = R.mapValues(entry.system.slots, (slot) => {
            return {
                prepared: slot.prepared.sort((a, b) => {
                    const spellA = a.id ? actor.items.get(a.id) : null;
                    const spellB = b.id ? actor.items.get(b.id) : null;

                    if (!spellA && !spellB) return 0;
                    if (!spellA) return 1;
                    if (!spellB) return -1;

                    return spellA.name.localeCompare(spellB.name);
                }),
            };
        });

        await entry.update({ "system.slots": updates });
    }

    #addSpellbookSortList(sheet: SpellPreparationSheet<CreaturePF2e>, $html: JQuery) {
        if (!sheet.isEditable) return;

        const html = $html[0];
        const actor = sheet.actor;
        const name = htmlQuery(html, ".sheet-header h1");
        const btn = this.#createSortBtn(false);

        name?.classList.add("with-sort");
        name?.prepend(btn);

        btn.addEventListener("click", async () => {
            const collectionId = htmlQuery(html, `[data-entry-id]`)?.dataset.entryId;
            const collection = actor.spellcasting.collections.get(collectionId ?? "");

            if (collection) {
                await this.#sortCollectionSpells(collection);
            }
        });
    }

    #addSpellcastingSortList(html: HTMLElement, actor: ActorPF2e) {
        if (!actor.isOfType("character")) return;

        const spellcasting = htmlQuery(html, `.tab[data-tab="spellcasting"] .known-spells`);
        const sections = spellcasting?.querySelectorAll<HTMLElement>(".spellcasting-entry");

        for (const section of sections ?? []) {
            const collectionId = section.dataset.itemId;
            const collection = actor.spellcasting.collections.get(collectionId ?? "");
            if (!collection) return;

            const entry = collection.entry as unknown as SpellcastingEntryPF2e<CreaturePF2e>;
            if (!isInstanceOf(entry, "SpellcastingEntryPF2e")) return;

            const name = htmlQuery(section, ".action-header .item-name");
            const disabled = collection.size < 2 || entry.isFlexible;
            const btn = this.#createSortBtn(disabled);

            name?.classList.add("with-sort");
            name?.prepend(btn);

            if (disabled) return;

            btn.addEventListener("click", async () => {
                if (entry.isPrepared) {
                    await this.#sortPrepCollection(entry);
                } else {
                    await this.#sortCollectionSpells(collection);
                }
            });
        }
    }

    #addActionsSortList(html: HTMLElement, actor: ActorPF2e) {
        if (!actor.isOfType("npc")) return;

        const actionsTab = htmlQuery(html, `.tab[data-tab="main"]`);

        for (const type of ["action", "passive"] as const) {
            const section = htmlQuery(actionsTab, `.section-container.${type}s`);
            const name = htmlQuery(section, ".section-header h4");
            const disabled = (htmlQuery(section, ".item-list")?.children.length ?? 0) < 2;
            const btn = this.#createSortBtn(disabled);

            name?.prepend(btn);

            if (disabled) continue;

            btn.addEventListener("click", async () => {
                const updates = R.pipe(
                    actor.itemTypes.action,
                    R.filter((item) => (type === "action" ? !!item.actionCost : !item.actionCost)),
                    R.sort((a, b) => a.name.localeCompare(b.name)),
                    R.map((item, index) => {
                        return { _id: item.id, sort: 50000 * index };
                    })
                );

                await actor.updateEmbeddedDocuments("Item", updates);
            });
        }
    }

    #addInventorySortList(html: HTMLElement, actor: ActorPF2e) {
        const isLoot = actor.isOfType("loot");
        const inventorySelector = isLoot ? ".sheet-body.inventory" : `.tab[data-tab="inventory"]`;
        const inventory = htmlQuery(html, inventorySelector + " .inventory-list");
        if (!inventory) return;

        const headers = inventory.querySelectorAll(":scope > header");

        for (const header of headers) {
            const itemsList = header.nextElementSibling as HTMLElement | undefined;
            if (!itemsList || !itemsList.classList.contains("items")) continue;

            const types = splitStr<PhysicalItemType>(itemsList.dataset.itemTypes ?? "");
            const hasContainer = !!types.findSplice((type) => type === "backpack");
            const disabled = itemsList.children.length < (hasContainer ? 1 : 2);
            const name = htmlQuery(header, ".item-name");
            const btn = this.#createSortBtn(disabled);

            name?.prepend(btn);

            if (disabled) continue;

            btn.addEventListener("click", async () => {
                if (isLoot && header.classList.contains("services")) {
                    const tool = MAPPED_TOOLS.betterMerchant as BetterMerchantTool;
                    const services = tool.getServices(actor);

                    sortByLocaleCompare(services, "label");
                    await services.setFlag();
                    return;
                }

                if (hasContainer) {
                }

                const updates = R.pipe(
                    types,
                    R.map((type) => type in actor.itemTypes && actor.itemTypes[type]),
                    R.filter(R.isTruthy),
                    R.flat(),
                    R.filter((item) => !item.isInContainer),
                    R.sort((a, b) => a._source.name.localeCompare(b._source.name)),
                    R.map((item, index) => {
                        return { _id: item.id, sort: 50000 * index };
                    })
                );

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
