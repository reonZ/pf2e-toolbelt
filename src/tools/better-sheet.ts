import {
    ActorPF2e,
    ActorSheetPF2e,
    belongToPartyAlliance,
    CharacterPF2e,
    CharacterSheetPF2e,
    ConsumablePF2e,
    createButtonElement,
    createHook,
    createHTMLElement,
    createToggleableWrapper,
    CreatureSheetData,
    EquipmentPF2e,
    FamiliarPF2e,
    FamiliarSheetPF2e,
    htmlClosest,
    htmlQuery,
    NPCSheetPF2e,
    R,
    renderActorSheets,
    toggleHooksAndWrappers,
    TreasurePF2e,
    waitDialog,
    waitTimeout,
    WeaponSheetPF2e,
    WeaponSource,
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

    #renderSheetSettingUpdate = foundry.utils.debounce(() => {
        this.#renderActorSheetHook.toggle(this.renderActorSheetEnabled);
        renderActorSheets();
    }, 1);

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
                key: "improvised",
                type: Boolean,
                default: false,
                scope: "user",
                onChange: () => {
                    this.#renderSheetSettingUpdate();
                },
            },
            {
                key: "mergeItems",
                type: Boolean,
                default: false,
                scope: "user",
                onChange: () => {
                    this.#renderSheetSettingUpdate();
                },
            },
            {
                key: "splitItem",
                type: Boolean,
                default: false,
                scope: "user",
                onChange: () => {
                    this.#renderSheetSettingUpdate();
                },
            },
        ];
    }

    get renderActorSheetEnabled(): boolean {
        return this.settings.splitItem || this.settings.mergeItems || this.settings.improvised;
    }

    ready(isGM: boolean): void {
        this.#renderActorSheetHook.toggle(this.renderActorSheetEnabled);
        toggleHooksAndWrappers(this.#partyAsObservedHooks, !isGM && this.settings.partyAsObserved);
    }

    #onRenderActorSheet(sheet: ActorSheetPF2e<ActorPF2e>, $html: JQuery) {
        const actor = sheet.actor;
        if (!actor.isOwner) return;

        const html = $html[0];
        const inventory = htmlQuery(html, `.tab.inventory`);
        if (!inventory) return;

        if (this.settings.mergeItems) {
            const btn = createButtonElement({
                dataset: { tooltip: this.localizePath("sheet.merge") },
                icon: "fa-solid fa-merge",
            });
            const li = createHTMLElement("li", { content: btn });

            btn.addEventListener("click", () => this.#mergeItems(actor, btn));

            htmlQuery(inventory, ".currency")?.append(li);
        }

        if (this.settings.splitItem) {
            const elements = inventory.querySelectorAll<HTMLElement>(
                ".items [data-item-id] .quantity span"
            );

            const splitItem = (event: MouseEvent) => {
                this.#splitItem(event, actor);
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

        if (actor.isOfType("character") && this.settings.improvised) {
            const btn = createHTMLElement("a", {
                content: `<i class="fa-solid fa-hammer-war"></i>`,
                dataset: { tooltip: this.localizePath("sheet.improvised") },
                style: { marginRight: "0.1em" },
            });

            btn.addEventListener("click", () => this.#createImprovisedWeapon(actor));

            htmlQuery(inventory, ".inventory-list header .item-controls")?.prepend(btn);
        }
    }

    async #createImprovisedWeapon(actor: ActorPF2e) {
        const source: DeepPartial<WeaponSource> = {
            name: this.localize("improvised.label"),
            system: {
                category: "simple",
                damage: {
                    die: "d4",
                    damageType: "bludgeoning",
                },
                traits: {
                    otherTags: ["improvised"],
                    value: ["thrown-10"],
                    rarity: "common",
                },
                usage: {
                    value: "held-in-one-plus-hands",
                },
            },
            type: "weapon",
        };

        const [item] = await actor.createEmbeddedDocuments("Item", [source]);

        if (item) {
            Hooks.once("renderWeaponSheetPF2e", (sheet: WeaponSheetPF2e) => {
                sheet.activateTab("details");
            });

            item.sheet.render(true);
        }
    }

    async #mergeItems(actor: ActorPF2e, btn: HTMLButtonElement) {
        type Mergeable =
            | EquipmentPF2e<ActorPF2e>
            | ConsumablePF2e<ActorPF2e>
            | TreasurePF2e<ActorPF2e>;

        btn.disabled = true;
        await waitTimeout();

        const itemsBySource: Record<ItemUUID, Mergeable[]> = R.groupBy(
            actor.inventory.filter((item): item is Mergeable & { sourceId: string } => {
                return (
                    item.isOfType("equipment", "consumable", "treasure") &&
                    item.isIdentified &&
                    !!item.sourceId
                );
            }),
            R.prop("sourceId")
        );

        const sources = R.pipe(
            await Promise.all(
                R.keys(itemsBySource).map(async (uuid) => {
                    return [uuid, await fromUuid<Mergeable>(uuid)] as const;
                })
            ),
            R.filter((args): args is [ItemUUID, Mergeable] => !!args[1]),
            R.mapToObj(([uuid, item]) => [uuid, item.toObject()])
        );

        const allItems = R.pipe(
            itemsBySource,
            R.pick(R.keys(sources)),
            R.mapValues((items = [], uuid) => {
                const source = sources[uuid];

                return items.filter((item) => {
                    const diff = foundry.utils.diffObject(source, item.toObject()) as DeepPartial<
                        Mergeable["_source"]
                    >;

                    delete diff.ownership;
                    delete diff._id;
                    delete diff._stats;
                    delete diff.system?.equipped;
                    delete diff.system?.identification;
                    delete diff.system?.quantity;

                    if (foundry.utils.isEmpty(diff.system)) {
                        delete diff.system;
                    }

                    return foundry.utils.isEmpty(diff);
                });
            }),
            R.entries(),
            R.filter((args): args is [ItemUUID, NonEmptyArray<Mergeable>] => args[1].length > 1)
        );

        if (!allItems.length) {
            btn.disabled = false;
            return this.warning("merge.none");
        }

        const content = R.pipe(
            allItems,
            R.map(([uuid]) => {
                const source = sources[uuid];
                return `<label class="item">
                    <img src="${source.img}">
                    <div class="name">${source.name}</div>
                    <input type="checkbox" name="${uuid}">
                </label>`;
            })
        );

        const result = await waitDialog<Record<ItemUUID, boolean>>({
            classes: ["toolbelt-merge-items"],
            content: content.join(""),
            i18n: this.localizeKey("merge"),
            title: this.localize("merge.title", actor),
            yes: {
                icon: "fa-solid fa-merge",
            },
        });

        btn.disabled = false;

        if (!result) return;

        const selected = R.keys(R.pickBy(result, R.isTruthy));
        if (!selected.length) return;

        const deletes: string[] = [];
        const updates = R.pipe(
            allItems,
            R.filter(([uuid]) => selected.includes(uuid)),
            R.map(([_, items]) => {
                const biggest = R.firstBy(items, (item) => item.quantity);
                const total = R.sumBy(items, (item) => item.quantity);

                deletes.push(...items.map((item) => item.id).filter((id) => id !== biggest.id));

                return {
                    _id: biggest.id,
                    "system.quantity": total,
                };
            })
        );

        await actor.deleteEmbeddedDocuments("Item", deletes);
        await actor.updateEmbeddedDocuments("Item", updates);
    }

    async #splitItem(event: MouseEvent, actor: ActorPF2e) {
        const itemId = htmlClosest(event.currentTarget, "[data-item-id]")?.dataset.itemId ?? "";
        const item = actor.items.get(itemId);
        if (!item?.isOfType("physical") || item.quantity <= 1) return;

        const result = await waitDialog<{ quantity: number }>({
            classes: ["toolbelt-split-item"],
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
    improvised: boolean;
    mergeItems: boolean;
    partyAsObserved: boolean;
    splitItem: boolean;
};

export { BetterSheetTool };
