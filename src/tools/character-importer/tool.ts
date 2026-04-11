import {
    addListenerAll,
    CharacterPF2e,
    CharacterSheetPF2e,
    CompendiumIndexData,
    confirmDialog,
    createHTMLElement,
    createToggleHook,
    htmlClosest,
    htmlQuery,
    ItemPF2e,
    ItemUUID,
    MODULE,
    R,
    renderCharacterSheets,
} from "foundry-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";
import {
    addCoreEventListeners,
    addDetailsEventListeners,
    addFeatsEventListeners,
    addInventoryEventListeners,
    addSkillsEventListeners,
    addSpellsEventListeners,
    CharacterImport,
    CharacterImportSource,
    EntryEventAction,
    importData,
    isPhysicalCategory,
    onEntryAction,
    prepareCoreTab,
    prepareDetailsTab,
    prepareFeatsTab,
    prepareInventoryTab,
    prepareSkillsTab,
    prepareSpellsTab,
} from ".";

const MENU = [
    { type: "core", icon: "fa-solid fa-address-card" },
    { type: "skills", icon: "fa-solid fa-hand" },
    { type: "feats", icon: "fa-solid fa-medal" },
    { type: "spells", icon: "fa-solid fa-wand-magic-sparkles" },
    { type: "inventory", icon: "fa-solid fa-box-open" },
    { type: "details", icon: "fa-solid fa-book-reader" },
] as const;

const MENU_TYPES = R.map(MENU, ({ type }) => type);

const ENABLED_SETTING = ["disabled", "gm", "all"] as const;

const SHEET_MENU_CLASS = "pf2e-toolbelt-character-importer";
const SHEET_MENU_LOADER_CLASS = "pf2e-toolbelt-character-importer-loader";

class CharacterImporterTool extends ModuleTool<ToolSettings> {
    #loaded = false;
    #sheetRenderHook = createToggleHook("renderCharacterSheetPF2e", this.#onRenderCharacterSheetPF2e.bind(this));

    get key(): "characterImporter" {
        return "characterImporter";
    }

    get settingsSchema(): ToolSettingsList<ToolSettings> {
        return [
            {
                key: "enabled",
                type: String,
                default: "disabled",
                choices: ENABLED_SETTING,
                scope: "world",
                onChange: async (value: ToolSettings["enabled"]) => {
                    const activate = value === "all" || (value === "gm" && game.user.isGM);

                    this.#sheetRenderHook.toggle(activate);

                    if (activate) {
                        await this.#loadTemplates();
                    }

                    renderCharacterSheets();
                },
            },
        ];
    }

    init(isGM: boolean): void {
        const enabled = this.settings.enabled;
        const activate = enabled === "all" || (enabled === "gm" && isGM);

        if (activate) {
            this.#loadTemplates();
        }

        this.#sheetRenderHook.toggle(activate);
    }

    async getImportData(actor: CharacterPF2e, sourceOnly: true): Promise<CharacterImportSource | undefined>;
    async getImportData(actor: CharacterPF2e, sourceOnly?: boolean): Promise<CharacterImport | undefined>;
    async getImportData(actor: CharacterPF2e, sourceOnly?: boolean) {
        const source = this.getFlag<CharacterImportSource>(actor, "data");
        const model = await CharacterImport.fromSource(source ?? {});
        return sourceOnly ? model?.encode() : model;
    }

    setImportData(actor: CharacterPF2e, data: CharacterImport): Promise<CharacterPF2e> | undefined {
        const encoded = data.encode();
        return encoded ? this.setFlag(actor, "==data", encoded) : undefined;
    }

    fullTemplatePath(...path: string[]): string {
        return MODULE.templatePath(this.templatePath(...path));
    }

    addLoader(html: HTMLElement) {
        this.removeSheetContent(html);

        if (htmlQuery(html, `.${SHEET_MENU_LOADER_CLASS}`)) return;

        const loader = createHTMLElement("div", {
            classes: [SHEET_MENU_LOADER_CLASS],
            content: `<div class="loader"><i class="fa-solid fa-spinner fa-spin-pulse"></i></div>`,
        });

        htmlQuery(html, ".sheet-body")?.appendChild(loader);
    }

    removeLoader(html: HTMLElement) {
        htmlQuery(html, `.${SHEET_MENU_LOADER_CLASS}`)?.remove();
    }

    async addSheetContent(html: HTMLElement, actor: CharacterPF2e) {
        this.addLoader(html);

        const data = await this.getImportData(actor);
        const context = await this.#prepareContext(actor, data);
        if (!this.getInMemory(actor, "importing")) return;

        const content = createHTMLElement("div", {
            classes: [SHEET_MENU_CLASS],
            content: await this.render("sheet", context),
            dataset: {
                tooltipDirection: "UP",
            },
        });

        this.removeLoader(html);
        this.#addEventListeners(html, content, actor);

        htmlQuery(html, ".sheet-body")?.appendChild(content);
    }

    removeSheetContent(html: HTMLElement) {
        htmlQuery(html, `.${SHEET_MENU_CLASS}`)?.remove();
    }

    async #prepareContext(
        this: CharacterImporterTool,
        actor: CharacterPF2e,
        data: CharacterImport | undefined,
    ): Promise<ImportDataContext | Pick<ImportDataContext, "partial">> {
        if (!data) {
            return {
                partial: (key: string) => this.fullTemplatePath(key),
            };
        }

        const tabs: ImportDataContext["tabs"] = {
            core: await prepareCoreTab.call(this, actor, data),
            details: await prepareDetailsTab.call(this, actor, data),
            feats: await prepareFeatsTab.call(this, actor, data),
            inventory: await prepareInventoryTab.call(this, actor, data),
            skills: await prepareSkillsTab.call(this, actor, data),
            spells: await prepareSpellsTab.call(this, actor, data),
        };

        return {
            hasData: true,
            menu: MENU,
            partial: (key: string) => this.fullTemplatePath(key),
            tabs,
        };
    }

    async #loadTemplates(): Promise<Handlebars.TemplateDelegate[] | undefined> {
        if (this.#loaded) return;

        this.#loaded = true;

        const templates = MENU_TYPES.map((path) => this.fullTemplatePath(path));
        return foundry.applications.handlebars.loadTemplates(templates.flat());
    }

    #onRenderCharacterSheetPF2e(sheet: CharacterSheetPF2e<CharacterPF2e>, $html: JQuery) {
        if (!sheet.isEditable) return;

        const html = $html[0];
        const actor = sheet.actor;
        const levelEl = htmlQuery(html, ".char-header .char-level");
        const cancelTooltip = this.localize("sheet.level.cancel");
        const importTooltip = this.localize("sheet.level.import");

        const btn = createHTMLElement("a", {
            classes: ["character-importer"],
            content: `<i class="cancel fa-solid fa-ban" data-tooltip="${cancelTooltip}"></i>
            <i class="import fa-solid fa-download" data-tooltip="${importTooltip}"></i>`,
        });

        if (this.getInMemory(actor, "importing")) {
            sheet.form.classList.add("importing-character");
            this.addSheetContent(html, actor);
        }

        levelEl?.appendChild(btn);

        btn.addEventListener("click", async () => {
            const importing = sheet.form.classList.toggle("importing-character");

            if (importing) {
                this.setInMemory(actor, "importing", true);
                this.addSheetContent(html, actor);
            } else {
                this.deleteInMemory(actor, "importing");
                this.removeLoader(html);
                this.removeSheetContent(html);
            }
        });
    }

    #addEventListeners(html: HTMLElement, content: HTMLElement, actor: CharacterPF2e) {
        {
            const { key, scroll } = this.getInMemory<InMemoryTab>(actor, "tab") ?? {};
            const isTabKey = R.isIncludedIn(key, MENU_TYPES);
            const tabKey = isTabKey ? key : MENU_TYPES[0];

            const nav = htmlQuery(content, `.menu .entry[data-tab="${tabKey}"]`);
            const tab = htmlQuery(content, `.data[data-tab="${tabKey}"]`);

            nav?.classList.add("selected");
            tab?.classList.add("selected");

            if (isTabKey && tab && R.isNumber(scroll) && scroll) {
                requestAnimationFrame(() => {
                    tab.scrollTop = scroll;
                });
            }

            if (!isTabKey && tabKey) {
                this.setInMemory<InMemoryTab>(actor, "tab", { key: tabKey });
            }
        }

        addListenerAll(content, "[data-action]", async (el) => {
            const action = el.dataset.action as EventAction;

            if (action.startsWith("entry-")) {
                return onEntryAction.call(this, actor, el);
            }

            switch (action) {
                case "delete-data": {
                    const confirm = await confirmDialog(this.path("deleteData"));
                    return confirm && this.unsetFlag(actor, "data");
                }

                case "import-code": {
                    return importData.call(this, html, actor, false);
                }

                case "import-file": {
                    return importData.call(this, html, actor, true);
                }

                case "open-sheet": {
                    const item = await fromUuid<ItemPF2e>(el.dataset.itemUuid ?? "");
                    return item?.sheet.render(true);
                }

                case "select-tab": {
                    const key = el.dataset.tab as ImportMenuType;
                    const tabs = content.querySelectorAll<HTMLElement>("[data-tab]");

                    for (const tab of tabs) {
                        tab.scrollTop = 0;
                        tab.classList.toggle("selected", tab.dataset.tab === key);
                    }

                    return this.setInMemory<InMemoryTab>(actor, "tab", { key });
                }
            }
        });

        const onScroll = (el: HTMLElement) => {
            const key = el.dataset.tab as ImportMenuType;

            if (this.getInMemory<ImportMenuType>(actor, "tab.key") === key) {
                this.setInMemory<number>(actor, "tab.scroll", el.scrollTop);
            }
        };

        addListenerAll(content, ".data[data-tab]", "scroll", foundry.utils.debounce(onScroll, 200));

        const onDrop = async (_: HTMLElement, event: DragEvent) => {
            event.stopPropagation();
            event.preventDefault();

            const entry = htmlClosest(event.target, "[data-droppable][data-item-type]");
            if (!entry) return;

            try {
                const dataString = event.dataTransfer?.getData("text/plain");
                const dropData = JSON.parse(dataString ?? "");

                if (!R.isPlainObject(dropData) || dropData.type !== "Item" || !R.isString(dropData.uuid)) {
                    throw MODULE.Error("invalid data type.");
                }

                let itemType = R.isString(dropData.itemType)
                    ? dropData.itemType
                    : fromUuidSync<CompendiumIndexData>(dropData.uuid)?.type;

                if (entry.dataset.itemType === "container" && itemType === "backpack") {
                    itemType = "container";
                }

                if (
                    isPhysicalCategory(entry.dataset.itemType) &&
                    isPhysicalCategory(itemType) &&
                    itemType !== "backpack"
                ) {
                    itemType = entry.dataset.itemType;
                }

                if (!itemType || itemType !== entry.dataset.itemType) {
                    throw MODULE.Error("invalid item type.");
                }

                const data = await this.getImportData(actor);
                const item = await fromUuid<ItemPF2e>(dropData.uuid as ItemUUID);

                if (!data || !item) {
                    throw MODULE.Error("an error occured while processing import data.");
                }

                if (data.updateEntryOverride(itemType, item, Number(entry.dataset.index))) {
                    await this.setImportData(actor, data);
                }
            } catch (error) {
                console.error(error);
            }
        };

        addListenerAll(content, ".data", "drop", onDrop, true);

        addCoreEventListeners.call(this, content, actor);
        addDetailsEventListeners.call(this, content, actor);
        addFeatsEventListeners.call(this, content, actor);
        addInventoryEventListeners.call(this, content, actor);
        addSkillsEventListeners.call(this, content, actor);
        addSpellsEventListeners.call(this, content, actor);
    }
}

type EventAction = EntryEventAction | "delete-data" | "import-code" | "import-file" | "open-sheet" | "select-tab";

type InMemoryTab = {
    key: ImportMenuType;
    scroll?: number;
};

type ImportDataContext = {
    hasData: true;
    menu: typeof MENU;
    partial: (key: string) => string;
    tabs: Record<ImportMenuType, Record<string, any>>;
};

type ImportMenuType = (typeof MENU)[number]["type"];

type ToolSettings = {
    enabled: (typeof ENABLED_SETTING)[number];
};

export { CharacterImporterTool };
