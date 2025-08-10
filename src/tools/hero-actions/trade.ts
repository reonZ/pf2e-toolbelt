import {
    addListener,
    ApplicationClosingOptions,
    ApplicationConfiguration,
    ApplicationRenderOptions,
} from "module-helpers";
import { ModuleToolApplication } from "module-tool";
import { HeroActionsArray, HeroActionsTool, openDescriptionFromElement, TradeActor } from ".";

class TradeHeroAction extends ModuleToolApplication<HeroActionsTool> {
    #actions: HeroActionsArray;
    #others: TradeActor[];
    #resolve: TradeHeroResolve;
    #selected: string;

    static DEFAULT_OPTIONS: DeepPartial<ApplicationConfiguration> = {
        classes: ["pf2e-toolbelt-heroActions-trade"],
        position: {
            width: 600,
        },
        tag: "form",
        window: {
            contentClasses: ["standard-form"],
        },
    };

    static wait(
        actions: HeroActionsArray,
        others: TradeActor[],
        tool: HeroActionsTool
    ): Promise<Parameters<TradeHeroResolve>[0]> {
        return new Promise((resolve: TradeHeroResolve) => {
            new TradeHeroAction(actions, others, resolve, tool).render(true);
        });
    }

    constructor(
        actions: HeroActionsArray,
        others: TradeActor[],
        resolve: TradeHeroResolve,
        tool: HeroActionsTool,
        options?: DeepPartial<ApplicationConfiguration>
    ) {
        super(tool, options);

        this.#actions = actions;
        this.#others = others;
        this.#resolve = resolve;
        this.#selected = others[0].id;
    }

    get key(): string {
        return "trade";
    }

    get title(): string {
        return this.localize("title");
    }

    _onClose(options: ApplicationClosingOptions): void {
        this.#resolve(null);
    }

    async _prepareContext(options: ApplicationRenderOptions): Promise<TradeHeroActionContext> {
        return {
            actions: this.#actions,
            others: this.#others,
            selected: this.#selected,
        };
    }

    async _onClickAction(event: PointerEvent, target: HTMLElement) {
        const action = target.dataset.action as EventAction;

        if (action === "cancel") {
            this.close();
        } else if (action === "description") {
            openDescriptionFromElement(target);
        } else if (action === "trade") {
            this.#trade();
        }
    }

    protected _activateListeners(html: HTMLElement): void {
        addListener(html, `[name="target"]`, "change", (el: HTMLSelectElement) => {
            this.#selected = el.value;
            this.render();
        });
    }

    #trade() {
        const form = this.form;
        if (!form) return;

        const data = new foundry.applications.ux.FormDataExtended(form).object as {
            target: string;
            action: DocumentUUID;
            [k: `action-${string}`]: DocumentUUID;
        };

        this.#resolve({
            action: data.action,
            target: data.target,
            targetAction: data[`action-${data.target}`],
        });

        this.close();
    }
}

type EventAction = "cancel" | "description" | "trade";

type TradeHeroResolve = (
    value: { target: string; action: DocumentUUID; targetAction?: DocumentUUID } | null
) => void;

type TradeHeroActionContext = {
    actions: HeroActionsArray;
    others: TradeActor[];
    selected: string;
};

export { TradeHeroAction };
