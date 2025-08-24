import {
    ActorPF2e,
    ActorSheetPF2e,
    belongToPartyAlliance,
    CharacterPF2e,
    CharacterSheetPF2e,
    createHook,
    createHTMLElement,
    createToggleableWrapper,
    CreatureSheetData,
    FamiliarPF2e,
    FamiliarSheetPF2e,
    htmlClosest,
    htmlQuery,
    NPCSheetPF2e,
    renderActorSheets,
    toggleHooksAndWrappers,
    waitDialog,
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

    #renderActorSheetHook = createHook("renderActorSheet", this.#onRenderActorSheet.bind(this));

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
            {
                key: "splitItem",
                type: Boolean,
                default: false,
                scope: "user",
                onChange: (value) => {
                    this.#renderActorSheetHook.toggle(value);
                    renderActorSheets();
                },
            },
        ];
    }

    ready(isGM: boolean): void {
        this.#renderActorSheetHook.toggle(this.settings.splitItem);
        toggleHooksAndWrappers(this.#partyAsObservedHooks, !isGM && this.settings.partyAsObserved);
    }

    #onRenderActorSheet(sheet: ActorSheetPF2e<ActorPF2e>, $html: JQuery) {
        const actor = sheet.actor;
        if (!actor.isOwner) return;

        const html = $html[0];
        const inventory = htmlQuery(html, `.tab.inventory section.inventory-list`);
        if (!inventory) return;

        const elements = inventory.querySelectorAll<HTMLElement>(
            ".items [data-item-id] .quantity span"
        );

        const splitItem = (event: MouseEvent) => {
            this.#onSplitItem(event, actor);
        };

        for (const el of elements) {
            const quantity = Number(el.innerText);
            if (isNaN(quantity) || quantity <= 1) continue;

            const btn = createHTMLElement("a", {
                content: el.innerText,
                dataset: { tooltip: this.localizePath("sheet.split") },
            });

            btn.addEventListener("click", splitItem);

            el.replaceChildren(btn);
        }
    }

    async #onSplitItem(event: MouseEvent, actor: ActorPF2e) {
        const itemId = htmlClosest(event.currentTarget, "[data-item-id]")?.dataset.itemId ?? "";
        const item = actor.items.get(itemId);
        if (!item?.isOfType("physical") || item.quantity <= 1) return;

        const result = await waitDialog<{ quantity: number }>({
            classes: ["toolbelt-split"],
            content: [
                {
                    type: "number",
                    inputConfig: {
                        name: "quantity",
                        min: 0,
                        max: item.quantity,
                        value: Math.floor(item.quantity / 2),
                        autofocus: true,
                    },
                },
            ],
            data: item,
            i18n: this.localizeKey("split"),
            yes: {
                icon: "fa-solid fa-split",
            },
        });

        if (!result) return;

        const quantity = Math.min(result.quantity, item.quantity);
        if (quantity < 1) return;

        await item.update({ "system.quantity": item.quantity - quantity });

        const source = item.toObject();
        source.system.quantity = quantity;

        await actor.createEmbeddedDocuments("Item", [source]);
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
    splitItem: boolean;
};

export { BetterSheetTool };
