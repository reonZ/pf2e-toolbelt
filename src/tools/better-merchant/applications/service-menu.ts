import {
    addEnterKeyListeners,
    addListener,
    enrichHTML,
    htmlQuery,
    ImageFilePath,
    isScriptMacro,
    LootPF2e,
    MacroPF2e,
    MODULE,
} from "foundry-helpers";
import { ModuleToolApplication } from "module-tool-application";
import { BetterMerchantTool, DEFAULT_SERVICE_ICON, exportService, getServiceMacro, ServiceData } from "..";

class ServiceMenu extends ModuleToolApplication<BetterMerchantTool> {
    #actor: LootPF2e;
    #service: ServiceData;

    static DEFAULT_OPTIONS: DeepPartial<fa.ApplicationConfiguration> = {
        classes: ["pf2e-toolbelt-better-merchant-service"],
        form: {
            closeOnSubmit: false,
            submitOnChange: true,
            handler: ServiceMenu.#onFormUpdate,
        },
        position: {
            width: 600,
            height: 600,
        },
        tag: "form",
    };

    constructor(
        actor: LootPF2e,
        serviceId: string,
        tool: BetterMerchantTool,
        options?: DeepPartial<fa.ApplicationConfiguration>,
    ) {
        super(tool, options);

        this.#actor = actor;

        const service = this.services.find((x) => x.id === serviceId);
        if (!service) {
            throw MODULE.Error(`Service with id '${serviceId}' cannot be found.`);
        }

        this.#service = service;
    }

    get key(): string {
        return "serviceMenu";
    }

    get actor(): LootPF2e {
        return this.#actor;
    }

    get services(): ServiceData[] {
        return this.tool.getServices(this.actor);
    }

    get service(): ServiceData {
        return this.#service;
    }

    get title(): string {
        return this.localize("title", this.service);
    }

    protected _onClose(_options: fa.ApplicationClosingOptions): void {
        const service = this.service;
        const services = this.services;

        if (!services.findSplice((x) => x.id === service.id, service)) {
            services.push(service);
        }

        this.tool.setServives(this.actor, services);
    }

    async _prepareContext(_options: fa.ApplicationRenderOptions): Promise<ServiceMenuContext> {
        const service = this.service;

        return {
            enrichedDescription: await enrichHTML(service.description),
            macro: await getServiceMacro(service),
            service,
        };
    }

    get macroInput(): HTMLInputElement | null {
        return htmlQuery<HTMLInputElement>(this.element, "input[name='macroUUID']");
    }

    async _renderFrame(options: fa.ApplicationRenderOptions) {
        const frame = await super._renderFrame(options);

        const exportLabel = this.localize("export");
        const exportBtn = `<button type="button" class="header-control icon fa-regular fa-file-export"
        data-action="export" data-tooltip="${exportLabel}"></button>`;

        this.window.close.insertAdjacentHTML("beforebegin", exportBtn);

        return frame;
    }

    async _onClickAction(_event: PointerEvent, target: HTMLElement) {
        const action = target.dataset.action as EventAction;

        if (action === "delete-macro") {
            const macroInput = this.macroInput;

            if (macroInput) {
                macroInput.value = "";
                this.#updateService();
            }
        } else if (action === "edit-image") {
            this.#editImage(target as HTMLImageElement);
        } else if (action === "export") {
            const service = this.service;
            const data = exportService(service);

            game.clipboard.copyPlainText(JSON.stringify(data));
            this.localize.info("copied", service);
        } else if (action === "open-macro-sheet") {
            const macro = await getServiceMacro({ macroUUID: this.macroInput?.value });
            macro?.sheet.render(true);
        } else if (action === "open-macros") {
            ui.macros.renderPopout();
        }
    }

    protected _activateListeners(html: HTMLElement): void {
        addEnterKeyListeners(html);

        addListener(html, ".header", "drop", async (_el, event) => {
            const macroInput = this.macroInput;
            if (!macroInput) return;

            try {
                const dataString = event.dataTransfer?.getData("text/plain");
                const dropData = JSON.parse(dataString ?? "");

                if (typeof dropData !== "object" || dropData.type !== "Macro") {
                    throw new Error("invalid data type.");
                }

                const macro = await getDocumentClass("Macro").fromDropData(dropData);
                const macroUUID = isScriptMacro(macro) ? macro.uuid : undefined;

                if (!macroUUID) {
                    throw new Error("must be a script macro.");
                }

                macroInput.value = macroUUID;
                this.#updateService();
            } catch (err: any) {
                throw MODULE.Error(err);
            }
        });
    }

    #updateService() {
        const event = new Event("change");
        this.element.dispatchEvent(event);
    }

    #editImage(img: HTMLImageElement) {
        const filePicker = new foundry.applications.apps.FilePicker.implementation({
            current: img.dataset.src,
            type: "image",
            callback: (path) => {
                img.src = path;
                img.dataset.src = path;

                this.#updateService();
            },
        });

        filePicker.browse();
    }

    static async #onFormUpdate(
        this: ServiceMenu,
        _event: SubmitEvent | Event,
        form: HTMLFormElement,
        formData: foundry.applications.ux.FormDataExtended,
    ) {
        type FormData = Omit<ServiceData, "img" | "price" | "macroUUID"> & {
            macroUUID: string;
            price: string;
        };

        const dataObj = formData.object as FormData;
        const img = htmlQuery<HTMLImageElement>(form, ".image")?.dataset.src;

        const services = this.services;
        const service = (this.#service = {
            ...dataObj,
            img: (img ?? DEFAULT_SERVICE_ICON) as ImageFilePath,
            macroUUID: (await getServiceMacro(dataObj))?.uuid ?? null,
            price: game.pf2e.Coins.fromString(dataObj.price),
        });

        if (!services.findSplice((x) => x.id === service.id)) {
            services.push(service);
        }

        this.render();
    }
}

type EventAction = "edit-image" | "export" | "open-macro-sheet" | "delete-macro" | "open-macros";

type ServiceMenuContext = fa.ApplicationRenderContext & {
    enrichedDescription: string;
    macro: MacroPF2e | null;
    service: ServiceData;
};

export { ServiceMenu };
