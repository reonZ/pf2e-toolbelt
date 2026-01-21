import {
    addListenerAll,
    ApplicationConfiguration,
    ApplicationRenderOptions,
    Coins,
    confirmDialog,
    createConsumableFromSpell,
    getSpellRankLabel,
    htmlQuery,
    htmlQueryIn,
    ItemPF2e,
    ItemSourcePF2e,
    LootPF2e,
    R,
    Rarity,
} from "module-helpers";
import { ModuleToolApplication } from "module-tool";
import { BetterMerchantTool } from ".";

class BrowserPullMenu extends ModuleToolApplication<BetterMerchantTool> {
    static PULL_LIMIT = 100;

    #actor: LootPF2e;
    #owned: string[];
    #results: CompendiumBrowserIndexData[];
    #selected: MenuSelection[] = [];

    static DEFAULT_OPTIONS: DeepPartial<ApplicationConfiguration> = {
        id: "pf2e-toolbelt-better-merchant-browserPull",
        position: {
            width: 700,
        },
    };

    constructor(
        tool: BetterMerchantTool,
        actor: LootPF2e,
        tab: "equipment" | "spell",
        options: DeepPartial<ApplicationConfiguration> = {},
    ) {
        super(tool, options);

        this.#actor = actor;
        this.#results = tool.browserTab(tab).results;

        this.#owned =
            tab === "equipment"
                ? R.pipe(
                      actor.inventory.contents,
                      R.map((item) => item.sourceId),
                      R.filter(R.isTruthy),
                  )
                : [];

        this.#selectToLimit();
    }

    get key(): string {
        return "browserPull";
    }

    get title(): string {
        return this.localize("title", this.actor);
    }

    get actor(): LootPF2e {
        return this.#actor;
    }

    async _prepareContext(options: ApplicationRenderOptions): Promise<BrowserPullContext> {
        const entries = R.map(this.#results, (data): ItemEntry => {
            const ranks: RequiredSelectOptions = R.isNumber(data.rank)
                ? R.range(data.rank, 11).map((rank) => {
                      return { value: String(rank), label: getSpellRankLabel(rank) };
                  })
                : [];

            return {
                img: data.img,
                level: data.level,
                name: data.name,
                owned: R.isIncludedIn(data.uuid, this.#owned),
                price: data.price,
                ranks,
                rarity: data.rarity === "common" ? undefined : data.rarity,
                uuid: data.uuid,
            };
        });

        return {
            entries,
        };
    }

    protected _onFirstRender(context: object, options: ApplicationRenderOptions): void {
        this.#updateCheckboxes();
    }

    protected _onClickAction(event: PointerEvent, target: HTMLElement): void {
        type EventAction = "add-to-merchant" | "toggle-all" | "open-sheet";

        const action = target.dataset.action as EventAction;

        if (action === "add-to-merchant") {
            this.#addToMerchant();
            this.close();
        } else if (action === "open-sheet") {
        } else if (action === "toggle-all") {
            if (this.#selected.length === 0) {
                this.#selectToLimit();
            } else {
                this.#selected.length = 0;
            }

            this.#updateCheckboxes();
        }
    }

    protected _activateListeners(html: HTMLElement): void {
        addListenerAll(html, `[name="selected-item"]`, "change", (el: HTMLInputElement) => {
            const uuid = el.dataset.uuid;
            if (!uuid) return;

            if (el.checked) {
                const rank = htmlQueryIn(el, ".item", "select")?.value;
                this.#selected.push({ uuid, rank: rank ? Number(rank) : undefined });
            } else {
                this.#selected.findSplice((entry) => entry.uuid === uuid);
            }

            this.#updateCheckboxes();
        });

        addListenerAll(html, `[name="rank"]`, "change", (el: HTMLSelectElement) => {
            const uuid = el.dataset.uuid as ItemUUID;
            const selected = this.#selected.find((entry) => entry.uuid === uuid);

            if (selected) {
                selected.rank = Number(el.value);
            }
        });
    }

    async #addToMerchant() {
        const selection = this.#selected.slice();
        if (selection.length === 0) return;

        const actor = this.#actor;
        const confirm = await confirmDialog(this.localizeKey(), {
            content: this.localize("confirm", { nb: selection.length }),
            title: this.localize("title", actor),
        });
        if (!confirm) return;

        const groups: MenuSelection[][] = [];

        while (selection.length) {
            const entry = selection.splice(0, 10);
            groups.push(entry);
        }

        const getItemSource = async ({ uuid, rank }: MenuSelection): Promise<ItemSourcePF2e | undefined> => {
            const item = await fromUuid<ItemPF2e>(uuid);
            if (!(item instanceof Item)) return;

            if (item.isOfType("physical")) {
                return item.toObject();
            }

            if (item.isOfType("spell") && !item.isCantrip && !item.isFocusSpell && !item.isRitual) {
                return createConsumableFromSpell(item, {
                    heightenedLevel: Math.max(rank ?? 0, item.baseRank),
                    type: "scroll",
                });
            }
        };

        for (const entries of groups) {
            const sources = R.pipe(await Promise.all(entries.map(getItemSource)), R.filter(R.isTruthy));

            await actor.createEmbeddedDocuments("Item", sources);
        }

        this.info("finished");
    }

    #updateCheckboxes() {
        const itemsUl = htmlQuery(this.element, "ul");
        const countEl = htmlQuery(this.element, ".header .count");
        if (!itemsUl || !countEl) return;

        const selected = this.#selected.length;
        const isAtLimit = selected >= BrowserPullMenu.PULL_LIMIT;

        // count

        countEl.textContent = String(selected);

        // select inputs

        let element: Element;
        const iterator = document.createNodeIterator(itemsUl, NodeFilter.SHOW_ELEMENT);

        while ((element = iterator.nextNode() as Element)) {
            if (!(element instanceof HTMLInputElement)) continue;

            const uuid = element.dataset.uuid ?? "";
            const checked = !!this.#selected.find((entry) => entry.uuid === uuid);

            element.checked = checked;
            element.disabled = !checked && isAtLimit;
        }
    }

    #selectToLimit() {
        this.#selected.length = 0;

        for (const { uuid } of this.#results) {
            if (this.#owned.includes(uuid)) continue;
            this.#selected.push({ uuid });
            if (this.#selected.length >= BrowserPullMenu.PULL_LIMIT) break;
        }
    }
}

type BrowserPullContext = {
    entries: ItemEntry[];
};

type MenuSelection = { uuid: string; rank?: number };

type ItemEntry = {
    img: string;
    level: number;
    name: string;
    owned: boolean;
    price: Coins;
    ranks: RequiredSelectOptions;
    rarity: Exclude<Rarity, "common"> | undefined;
    uuid: ItemUUID;
};

type CompendiumBrowserIndexData = Omit<CompendiumIndexData, "_id">;

export { BrowserPullMenu };
