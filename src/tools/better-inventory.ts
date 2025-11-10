import {
    ActorPF2e,
    ActorSheetPF2e,
    Bulk,
    ConsumablePF2e,
    createButtonElement,
    createHTMLElement,
    createToggleableHook,
    createToggleableWrapper,
    EquipmentPF2e,
    getItemSourceId,
    htmlClosest,
    htmlQuery,
    InventoryBulk,
    ItemPF2e,
    MODULE,
    R,
    renderActorSheets,
    TreasurePF2e,
    waitDialog,
    waitTimeout,
    WeaponSheetPF2e,
    WeaponSource,
} from "module-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";

class BetterInventoryTool extends ModuleTool<ToolSettings> {
    #actorPrepareEmbeddedDocumentsWrapper = createToggleableWrapper(
        "WRAPPER",
        "CONFIG.Actor.documentClass.prototype.prepareEmbeddedDocuments",
        this.#actorPrepareEmbeddedDocuments,
        { context: this }
    );

    #treasurePreparedBaseDataWrapper = createToggleableWrapper(
        "WRAPPER",
        "CONFIG.PF2E.Item.documentClasses.treasure.prototype.prepareBaseData",
        this.#treasurePreparedBaseData,
        { context: this }
    );

    #renderSheetSettingUpdate = foundry.utils.debounce(() => {
        this.#renderActorSheetHook.toggle(this.renderActorSheetEnabled);
        renderActorSheets();
    }, 1);

    #renderActorSheetHook = createToggleableHook(
        "renderActorSheet",
        this.#onRenderActorSheet.bind(this)
    );

    get key(): "betterInventory" {
        return "betterInventory";
    }

    get settingsSchema(): ToolSettingsList<ToolSettings> {
        return [
            {
                key: "coins",
                type: Boolean,
                default: false,
                scope: "world",
                requiresReload: true,
            },
            {
                key: "dropped",
                type: Boolean,
                default: false,
                scope: "world",
                requiresReload: true,
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

    get api(): Record<string, any> {
        return {
            mergeItems: this.#mergeItems.bind(this),
            splitItem: this.#splitItem.bind(this),
        };
    }

    get renderActorSheetEnabled(): boolean {
        return this.settings.splitItem || this.settings.mergeItems || this.settings.improvised;
    }

    init(isGM: boolean): void {
        this.#actorPrepareEmbeddedDocumentsWrapper.toggle(this.settings.dropped);
        this.#treasurePreparedBaseDataWrapper.toggle(this.settings.coins);
    }

    ready(isGM: boolean): void {
        this.#renderActorSheetHook.toggle(this.renderActorSheetEnabled);
    }

    #actorPrepareEmbeddedDocuments(actor: ActorPF2e, wrapped: libWrapper.RegisterCallback) {
        wrapped();

        try {
            const InventoryBulkClass = actor.inventory.bulk.constructor as typeof InventoryBulk;

            // we cache the computed value
            let _value: Bulk | undefined;

            // our only/best solution is to re-define the ActorInventory#bulk#value getter
            Object.defineProperty(actor.inventory.bulk, "value", {
                get(this: InventoryBulk): Bulk {
                    if (_value) {
                        return _value;
                    }

                    _value = InventoryBulkClass.computeTotalBulk(
                        this.actor.inventory.filter((item) => {
                            return (
                                !item.isInContainer && item.system.equipped.carryType !== "dropped"
                            );
                        }),
                        this.actor
                    );

                    return _value;
                },
            });
        } catch (error) {
            MODULE.Error("An error occured while trying to make dropped items weighless.");
        }
    }

    #treasurePreparedBaseData(treasure: TreasurePF2e, wrapped: libWrapper.RegisterCallback) {
        wrapped();

        if (treasure.isCoinage) {
            treasure.system.bulk.value = 0;
        }
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

            for (const el of elements) {
                const quantity = Number(el.innerText);
                if (isNaN(quantity) || quantity <= 1) continue;

                const btn = createHTMLElement("a", {
                    content: el.innerText,
                    dataset: { tooltip: this.localizePath("sheet.split") },
                });

                btn.addEventListener("click", () => {
                    const itemId = htmlClosest(el, "[data-item-id]")?.dataset.itemId ?? "";
                    const item = actor.items.get(itemId);
                    this.#splitItem(item);
                });

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

    async #mergeItems(
        actor: ActorPF2e,
        btn?: HTMLButtonElement | HTMLAnchorElement
    ): Promise<void> {
        btn?.setAttribute("disabled", "true");
        await waitTimeout();

        const identicalItems = R.pipe(
            actor.inventory.filter((item): item is Mergeable => {
                return (
                    item.isOfType("equipment", "consumable", "treasure") &&
                    item.isIdentified &&
                    !!getItemSourceId(item)
                );
            }),
            R.groupBy((item) => getItemSourceId(item)),
            R.values(),
            R.filter((items) => items.length > 1),
            R.flatMap((items): NonEmptyArray<Mergeable>[] => getIdenticalItems(items)),
            R.filter((items): items is NonEmptyArray<Mergeable> => items.length > 1)
        );

        if (!identicalItems.length) {
            btn?.removeAttribute("disabled");
            this.warning("merge.none");
            return;
        }

        const content = R.pipe(
            identicalItems,
            R.map((items) => {
                const source = items[0];
                return `<label class="item">
                        <img src="${source.img}">
                        <div class="name">${source.name}</div>
                        <input type="checkbox" name="${source.id}">
                    </label>`;
            })
        );

        const result = await waitDialog<Record<string, boolean>>({
            classes: ["toolbelt-merge-items"],
            content: content.join(""),
            i18n: this.localizeKey("merge"),
            title: this.localize("merge.title", actor),
            yes: {
                icon: "fa-solid fa-merge",
            },
        });

        btn?.removeAttribute("disabled");
        if (!result) return;

        const selected = R.keys(R.pickBy(result, R.isTruthy));
        if (!selected.length) return;

        const deletes: string[] = [];
        const updates = R.pipe(
            identicalItems,
            R.filter((items) => selected.includes(items[0].id)),
            R.map((items) => {
                const biggest = items[0];

                const update: {
                    _id: string;
                    "system.quantity": number;
                    "system.uses.value"?: number;
                } = {
                    _id: biggest.id,
                    "system.quantity": 0,
                };

                if (biggest.isOfType("consumable")) {
                    const max = biggest.uses.max;
                    const uses = R.sumBy(
                        items as ConsumablePF2e[],
                        (item) => (item.quantity - 1) * max + item.uses.value
                    );
                    const remains = uses % max;

                    update["system.quantity"] = Math.ceil(uses / max);
                    update["system.uses.value"] = remains || max;
                } else {
                    update["system.quantity"] = R.sumBy(items, (item) => item.quantity);
                }

                deletes.push(...items.slice(1).map((item) => item.id));

                return update;
            })
        );

        await actor.deleteEmbeddedDocuments("Item", deletes);
        await actor.updateEmbeddedDocuments("Item", updates);
    }

    async #splitItem(item: Maybe<ItemPF2e>) {
        const actor = item?.actor;
        if (!actor || actor.pack || !item.isOfType("physical") || item.quantity <= 1) return;

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

        if ("uses" in source.system) {
            source.system.uses.value = source.system.uses.max;
        }

        await actor.createEmbeddedDocuments("Item", [source]);
    }
}

function getIdenticalItems(items: NonEmptyArray<Mergeable>): NonEmptyArray<Mergeable>[] {
    const sorted = R.sortBy(items, [R.prop("quantity"), "asc"]);
    const [biggest] = sorted.splice(0, 1);
    const source = biggest.toObject();

    const [identical, others] = R.partition(sorted, (item) => {
        const diff = foundry.utils.diffObject(source, item.toObject()) as DeepPartial<
            Mergeable["_source"]
        >;

        delete diff.sort;
        delete diff.ownership;
        delete diff._id;
        delete diff._stats;
        delete diff.system?.equipped;
        delete diff.system?.identification;
        delete diff.system?.quantity;

        if (diff.system && "uses" in diff.system) {
            delete diff.system.uses?.value;

            if (foundry.utils.isEmpty(diff.system.uses)) {
                delete diff.system.uses;
            }
        }

        // due to a mistake in the system some items may end up with this dead property after a player trade
        if (diff.system && "container" in diff.system) {
            delete diff.system.container;
        }

        if (foundry.utils.isEmpty(diff.system)) {
            delete diff.system;
        }

        return foundry.utils.isEmpty(diff);
    });

    if (others.length > 1) {
        return [[biggest, ...identical], ...getIdenticalItems(others as NonEmptyArray<Mergeable>)];
    } else {
        return [[biggest, ...identical]];
    }
}

type ToolSettings = {
    improvised: boolean;
    coins: boolean;
    dropped: boolean;
    mergeItems: boolean;
    splitItem: boolean;
};

type Mergeable = EquipmentPF2e<ActorPF2e> | ConsumablePF2e<ActorPF2e> | TreasurePF2e<ActorPF2e>;

export { BetterInventoryTool };
