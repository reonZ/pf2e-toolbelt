import {
    addListenerAll,
    ApplicationConfiguration,
    ApplicationRenderOptions,
    confirmDialog,
    htmlQuery,
    ItemPF2e,
    LootPF2e,
    PhysicalItemPF2e,
    R,
} from "module-helpers";
import { ModuleToolApplication } from "module-tool";
import { BetterMerchantTool } from ".";

class BrowserPullMenu extends ModuleToolApplication<BetterMerchantTool> {
    static PULL_LIMIT = 100;

    #actor: LootPF2e;
    #owned: string[];
    #results: CompendiumBrowserIndexData[];
    #selection: string[] = [];

    static DEFAULT_OPTIONS: DeepPartial<ApplicationConfiguration> = {
        id: "pf2e-toolbelt-better-merchant-browserPull",
        position: {
            width: 600,
        },
    };

    constructor(
        tool: BetterMerchantTool,
        actor: LootPF2e,
        options: DeepPartial<ApplicationConfiguration> = {}
    ) {
        super(tool, options);

        this.#actor = actor;
        this.#results = tool.browserTab.results;

        this.#owned = R.pipe(
            actor.inventory.contents,
            R.map((item) => item.sourceId),
            R.filter(R.isTruthy)
        );

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
        return {
            owned: this.#owned,
            results: this.#results,
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
            if (this.#selection.length === 0) {
                this.#selectToLimit();
            } else {
                this.#selection.length = 0;
            }

            this.#updateCheckboxes();
        }
    }

    protected _activateListeners(html: HTMLElement): void {
        addListenerAll(html, "[name='selected-item']", "change", (el: HTMLInputElement) => {
            const uuid = el.dataset.uuid;
            if (!uuid) return;

            if (el.checked) {
                this.#selection.push(uuid);
            } else {
                this.#selection.findSplice((x) => x === uuid);
            }

            this.#updateCheckboxes();
        });
    }

    async #addToMerchant() {
        const selection = this.#selection.slice();
        if (selection.length === 0) return;

        const actor = this.#actor;
        const confirm = await confirmDialog(this.localizeKey(), {
            content: this.localize("confirm", { nb: selection.length }),
            title: this.localize("title", actor),
        });
        if (!confirm) return;

        const groups: string[][] = [];

        while (selection.length) {
            const uuids = selection.splice(0, 10);
            groups.push(uuids);
        }

        await Promise.all(
            groups.map(async (uuids) => {
                const sources = R.pipe(
                    await Promise.all(uuids.map((uuid) => fromUuid<ItemPF2e>(uuid))),
                    R.filter((item): item is PhysicalItemPF2e => !!item?.isOfType("physical")),
                    R.map((item) => item.toObject())
                );
                return actor.createEmbeddedDocuments("Item", sources);
            })
        );

        this.info("finished");
    }

    #updateCheckboxes() {
        const itemsUl = htmlQuery(this.element, "ul");
        const countEl = htmlQuery(this.element, ".header .count");
        if (!itemsUl || !countEl) return;

        const selected = this.#selection.length;
        const isAtLimit = selected >= BrowserPullMenu.PULL_LIMIT;

        // count

        countEl.textContent = String(selected);

        // select inputs

        let element: Element;
        const iterator = document.createNodeIterator(itemsUl, NodeFilter.SHOW_ELEMENT);

        while ((element = iterator.nextNode() as Element)) {
            if (!(element instanceof HTMLInputElement)) continue;

            const uuid = element.dataset.uuid ?? "";
            const checked = this.#selection.includes(uuid);

            element.checked = checked;
            element.disabled = !checked && isAtLimit;
        }
    }

    #selectToLimit() {
        this.#selection.length = 0;

        for (const { uuid } of this.#results) {
            if (this.#owned.includes(uuid)) continue;
            this.#selection.push(uuid);
            if (this.#selection.length >= BrowserPullMenu.PULL_LIMIT) break;
        }
    }
}

type BrowserPullContext = {
    owned: string[];
    results: CompendiumBrowserIndexData[];
};

type CompendiumBrowserIndexData = Omit<CompendiumIndexData, "_id">;

export { BrowserPullMenu };
