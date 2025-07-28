import {
    addEnterKeyListeners,
    addListenerAll,
    ApplicationConfiguration,
    ApplicationRenderOptions,
    confirmDialog,
    FlagData,
    FlagDataArray,
    getInputValue,
    htmlClosest,
    LootPF2e,
    R,
} from "module-helpers";
import { ModuleToolApplication } from "module-tool";
import { DefaultFilterModel, ServiceFilterModel } from ".";
import { BetterMerchantTool, FILTER_TYPES, FilterType, FilterTypes } from "..";

class FiltersMenu extends ModuleToolApplication<BetterMerchantTool> {
    #actor: LootPF2e;

    static DEFAULT_OPTIONS: DeepPartial<ApplicationConfiguration> = {
        classes: ["pf2e-toolbelt-better-merchant-filters"],
        position: {
            width: 900,
            height: 600,
        },
        tag: "form",
    };

    constructor(
        actor: LootPF2e,
        tool: BetterMerchantTool,
        options?: DeepPartial<ApplicationConfiguration>
    ) {
        super(tool, options);

        this.#actor = actor;
    }

    get title(): string {
        return this.localize("title", this.actor);
    }

    get actor(): LootPF2e {
        return this.#actor;
    }

    get key(): string {
        return "filtersMenu";
    }

    async _prepareContext(options: ApplicationRenderOptions): Promise<FiltersMenuContext> {
        const sections = R.pipe(
            ["sell", "buy", "service"] as const,
            R.map((type): FilterSection => {
                return {
                    default: this.getDefaultFilter(type),
                    filters: this.getFilters(type),
                    type,
                } as FilterSection;
            })
        );

        return {
            sections,
        };
    }

    protected _onClickAction(event: PointerEvent, target: HTMLElement) {
        type EventAction = "add-filter" | "move-filter" | "edit-filter" | "delete-filter";

        const type = getSectionTypeFromElement(target);
        if (!type) return;

        const action = target.dataset.action as EventAction;

        if (action === "add-filter") {
            return this.#addFilter(type);
        }

        const filterId = getFilterIdFromElement(target);
        if (filterId === "default") return;

        if (action === "delete-filter") {
            this.#deleteFilter(type, filterId);
        } else if (action === "edit-filter") {
        } else if (action === "move-filter") {
            this.#moveFilter(type, filterId, target);
        }
    }

    getDefaultFilter<T extends FilterType>(type: T): FlagData<DefaultFilterModel> | undefined {
        return this.tool.getDefaultFilter(this.actor, type);
    }

    getFilters<T extends FilterType>(type: T): FlagDataArray<FilterTypes[T], LootPF2e> {
        return this.tool.getFilters(this.actor, type);
    }

    protected _activateListeners(html: HTMLElement): void {
        addEnterKeyListeners(html);

        addListenerAll(html, "input", "change", async (target) => {
            const type = getSectionTypeFromElement(target);
            if (!type) return;

            const key = target.name;
            const value = getInputValue(target);
            const filterId = getFilterIdFromElement(target);

            if (filterId === "default") {
                const filter = this.getDefaultFilter(type);
                if (!filter) return;

                filter.updateSource({ [key]: value });
                await filter.setFlag();
            } else {
                const filters = this.getFilters(type);
                const filter = filters.find((x) => x.id === filterId);
                if (!filter) return;

                filter.updateSource({ [key]: value });
                await filters.setFlag();
            }

            this.render();
        });
    }

    async #deleteFilter(type: FilterType, filterId: string) {
        const confirm = await confirmDialog(this.localizeKey("delete"));
        if (!confirm) return;

        const filters = this.getFilters(type);

        if (filters.findSplice((filter) => filter.id === filterId)) {
            await filters.setFlag();
            this.render();
        }
    }

    async #moveFilter(type: FilterType, filterId: string, target: HTMLElement) {
        const direction = target.dataset.direction ?? "";
        if (!["up", "down"].includes(direction)) return;

        const filters = this.getFilters(type);
        const index = filters.findIndex((filter) => filter.id === filterId);
        if (index < 0) return;

        const newIndex = index + (direction === "up" ? -1 : 1);
        if (newIndex < 0 || newIndex >= filters.length) return;

        const filter = filters[index];

        filters[index] = filters[newIndex];
        filters[newIndex] = filter;

        await filters.setFlag();
        this.render();
    }

    #addFilter(type: FilterType) {
        const actor = this.actor;

        const addFilter = async (filter: FilterTypes[keyof FilterTypes]) => {
            const filters = this.getFilters(type);
            filters.push(filter);
            await filters.setFlag();
            this.render();
        };

        if (type === "service") {
            const filter = new ServiceFilterModel();
            return addFilter(filter);
        }

        const label = this.tool.localize("browserFilter.create");
        const callback = () => {
            // new BrowserPullMenu(this, actor).render(true);
        };
        return this.tool.openEquipmentTab({ actor, label, callback });
    }
}

function getSectionTypeFromElement(target: HTMLElement): FilterType | undefined {
    const type = htmlClosest(target, "[data-section-type]")?.dataset.sectionType as FilterType;
    return type in FILTER_TYPES ? type : undefined;
}

function getFilterIdFromElement(target: HTMLElement): "default" | (string & {}) {
    return htmlClosest(target, "[data-filter-id]")?.dataset.filterId || "default";
}

type FiltersMenuContext = {
    sections: FilterSection[];
};

type FilterSection = {
    [k in FilterType]: {
        type: k;
        default: InstanceType<(typeof FILTER_TYPES)[k]["default"]> | undefined;
        filters: FilterTypes[k][];
    };
}[FilterType];

export { FiltersMenu };
