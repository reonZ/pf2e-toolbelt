import {
    addEnterKeyListeners,
    addListener,
    ApplicationClosingOptions,
    ApplicationConfiguration,
    ApplicationRenderOptions,
    FlagDataArray,
    htmlQuery,
    isScriptMacro,
    LootPF2e,
    MacroPF2e,
    MODULE,
} from "module-helpers";
import { ModuleToolApplication } from "module-tool";
import { BetterMerchantTool, DEFAULT_SERVICE_ICON, ServiceModel, ServiceSource } from "..";

class ServiceMenu extends ModuleToolApplication<BetterMerchantTool> {
    #actor: LootPF2e;
    #service: ServiceModel;

    static DEFAULT_OPTIONS: DeepPartial<ApplicationConfiguration> = {
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
        options?: DeepPartial<ApplicationConfiguration>
    ) {
        super(tool, options);

        this.#actor = actor;

        const service = this.services.find((x) => x.id === serviceId)?.clone();
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

    get services(): FlagDataArray<ServiceModel, LootPF2e> {
        return this.tool.getServices(this.actor);
    }

    get service(): ServiceModel {
        return this.#service;
    }

    get title(): string {
        return this.localize("title", this.service);
    }

    protected _onClose(options: ApplicationClosingOptions): void {
        const service = this.service;
        const services = this.services;

        if (!services.findSplice((x) => x.id === service.id, service)) {
            services.push(service);
        }

        services.setFlag();
    }

    async _prepareContext(options: ApplicationRenderOptions): Promise<ServiceMenuContext> {
        const service = this.service;

        return {
            enrichedDescription: await service.getEnrichedDescription(),
            service,
        };
    }

    get macroInput(): HTMLInputElement | null {
        return htmlQuery<HTMLInputElement>(this.element, "input[name='macroUUID']");
    }

    async _onClickAction(event: PointerEvent, target: HTMLElement) {
        type EventAction = "edit-image" | "open-macro-sheet" | "delete-macro" | "open-macros";

        const action = target.dataset.action as EventAction;

        if (action === "delete-macro") {
            const macroInput = this.macroInput;

            if (macroInput) {
                macroInput.value = "";
                this.#updateService();
            }
        } else if (action === "edit-image") {
            this.#editImage(target as HTMLImageElement);
        } else if (action === "open-macro-sheet") {
            const macro = await fromUuid<MacroPF2e>(this.macroInput?.value ?? "");
            macro?.sheet.render(true);
        } else if (action === "open-macros") {
            ui.macros.renderPopout();
        }
    }

    protected _activateListeners(html: HTMLElement): void {
        addEnterKeyListeners(html);

        addListener(html, ".header", "drop", async (el, event) => {
            const macroInput = this.macroInput;
            if (!macroInput) return;

            try {
                const dataString = event.dataTransfer?.getData("text/plain");
                const dropData = JSON.parse(dataString ?? "");

                if (typeof dropData !== "object" || dropData.type !== "Macro") {
                    throw new Error("invalid data type.");
                }

                const macro = await getDocumentClass("Macro").fromDropData(dropData);

                if (!isScriptMacro(macro)) {
                    throw new Error("must be a script macro.");
                }

                macroInput.value = macro.uuid;
                this.#updateService();
            } catch (err) {
                throw MODULE.Error(err);
            }
        });
    }

    #updateService() {
        const submitEvent = new SubmitEvent("submit");
        this.element.dispatchEvent(submitEvent);
    }

    #editImage(img: HTMLImageElement) {
        const filePicker = new FilePicker({
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
        event: SubmitEvent | Event,
        form: HTMLFormElement,
        formData: FormDataExtended
    ) {
        const dataObj = formData.object as Omit<ServiceSource, "img" | "price"> & { price: string };
        const img = htmlQuery<HTMLImageElement>(form, ".image")?.dataset.src;

        const data: ServiceSource = {
            ...dataObj,
            img: (img ?? DEFAULT_SERVICE_ICON) as ImageFilePath,
            macroUUID: dataObj.macroUUID || null,
            price: game.pf2e.Coins.fromString(dataObj.price).toObject(),
        };

        const service = this.service;
        const services = this.services;

        service.updateSource(data);

        if (!services.findSplice((x) => x.id === service.id)) {
            services.push(service);
        }

        this.render();
    }
}

type ServiceMenuContext = {
    enrichedDescription: string;
    service: ServiceModel;
};

export { ServiceMenu };
