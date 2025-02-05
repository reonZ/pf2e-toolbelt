import {
    ActorPF2e,
    ApplicationClosingOptions,
    ApplicationConfiguration,
    ApplicationRenderOptions,
    ConditionPF2e,
    DurationData,
    EffectSource,
    GrantItemSource,
    ItemPF2e,
    addListener,
    addListenerAll,
} from "module-helpers";
import { createTool } from "../tool";

let MANAGE = false;

const { config, settings, hook, localize, render } = createTool({
    name: "conditionManager",
    settings: [
        {
            key: "enabled",
            type: Boolean,
            default: false,
            scope: "client",
            onChange: (value: boolean) => {
                hook.toggle(value);
            },
        },
    ],
    hooks: [
        {
            event: "preCreateItem",
            listener: onPreCreateItem,
        },
    ],
    keybinds: [
        {
            name: "manage",
            onDown: () => {
                MANAGE = true;
            },
            onUp: () => {
                MANAGE = false;
            },
        },
    ],
    init: () => {
        hook.toggle(settings.enabled);
    },
} as const);

class ConditionManager extends foundry.applications.api.ApplicationV2 {
    #actor: ActorPF2e;
    #condition: ConditionPF2e;
    #data: ConditionManagerData;
    #counter: { value: number; default: number } | undefined;

    static DEFAULT_OPTIONS: DeepPartial<ApplicationConfiguration> = {
        classes: ["pf2e-toolbelt-condition-manager"],
    };

    constructor(
        condition: ConditionPF2e<ActorPF2e>,
        options: DeepPartial<ApplicationConfiguration> = {}
    ) {
        options.window ??= {};
        options.window.title = localize("manager.title", { name: condition._source.name });

        super(options);

        this.#actor = condition.actor;

        this.#condition = condition.clone();

        this.#data = {
            unidentified: false,
            duration: {
                expiry: "turn-start",
                unit: "rounds",
                value: 1,
            },
        };

        this.#counter = condition.system.value.isValued
            ? {
                  value: condition.system.value.value ?? 1,
                  default: condition.system.value.value ?? 1,
              }
            : undefined;
    }

    async close(options: ApplicationClosingOptions = {}): Promise<this> {
        options.animate = false;
        return super.close(options);
    }

    async _prepareContext(options: ApplicationRenderOptions): Promise<ConditionManagerContext> {
        return {
            isGM: game.user.isGM,
            data: this.#data,
            timeUnits: CONFIG.PF2E.timeUnits,
            counter: this.#counter,
            expiryOptions: [
                { value: "turn-start", label: "PF2E.Item.Effect.Expiry.StartOfTurn" },
                { value: "turn-end", label: "PF2E.Item.Effect.Expiry.EndOfTurn" },
                { value: "round-end", label: "PF2E.Item.Effect.Expiry.EndOfRound" },
            ],
        };
    }

    protected _renderHTML(context: object, options: ApplicationRenderOptions): Promise<string> {
        return render("manager", context);
    }

    protected _replaceHTML(
        result: string,
        content: HTMLElement,
        options: ApplicationRenderOptions
    ): void {
        content.innerHTML = result;
        this.#activateListeners(content);
    }

    #createEffect() {
        const condition = this.#condition;
        const rule: GrantItemSource = {
            key: "GrantItem",
            uuid: condition.sourceId,
            onDeleteActions: {
                grantee: "restrict",
            },
            inMemoryOnly: true,
        };

        if (this.#counter && this.#counter.value > 1) {
            rule.alterations = [
                {
                    mode: "override",
                    property: "badge-value",
                    value: this.#counter.value,
                },
            ];
        }

        const prefix = game.i18n.localize("TYPES.Item.effect");
        const effect: PreCreate<EffectSource> = {
            type: "effect",
            name: `${prefix}: ${condition.name}`,
            img: condition.img,
            system: {
                ...this.#data,
                tokenIcon: { show: false },
                rules: [rule],
            },
        };

        this.#actor.createEmbeddedDocuments("Item", [effect]);
    }

    #activateListeners(html: HTMLElement) {
        addListener(
            html,
            "[name='system.duration.unit']",
            "change",
            (event, el: HTMLSelectElement) => {
                const value = el.value as DurationData["unit"];
                const isUnit = !["unlimited", "encounter"].includes(value);

                this.#data.duration.unit = value;
                this.#data.duration.value = isUnit ? 1 : -1;
                this.#data.duration.expiry = isUnit ? "turn-start" : null;

                this.render();
            }
        );

        addListener(
            html,
            "[name='system.duration.expiry']",
            "change",
            (event, el: HTMLSelectElement) => {
                this.#data.duration.expiry = el.value as DurationData["expiry"];
            }
        );

        addListener(
            html,
            "[name='system.duration.value']",
            "change",
            (event, el: HTMLInputElement) => {
                this.#data.duration.value = Math.max(el.valueAsNumber || 0, 0);
                this.render();
            }
        );

        addListener(
            html,
            "[name='system.unidentified']",
            "change",
            (event, el: HTMLInputElement) => {
                this.#data.unidentified = el.checked;
            }
        );

        addListener(
            html,
            "[name='system.badge.value']",
            "change",
            (event, el: HTMLInputElement) => {
                const value = el.valueAsNumber;

                this.#counter!.value = isNaN(value)
                    ? this.#counter!.default
                    : Math.max(el.valueAsNumber, 1);

                this.render();
            }
        );

        addListenerAll(html, "[data-action]", (event, el) => {
            switch (el.dataset.action as "add" | "cancel") {
                case "add": {
                    this.#createEffect();
                    return this.close();
                }

                case "cancel": {
                    return this.close();
                }
            }
        });
    }
}

function onPreCreateItem(item: ItemPF2e<ActorPF2e>) {
    if (!MANAGE || !item.isOfType("condition") || !item.actor) return;
    new ConditionManager(item).render(true);
    return false;
}

type ConditionManagerData = {
    duration: DurationData;
    unidentified: boolean;
};

type ConditionManagerContext = {
    isGM: boolean;
    data: ConditionManagerData;
    timeUnits: typeof CONFIG.PF2E.timeUnits;
    counter: { value: number; default: number } | undefined;
    expiryOptions: {
        value: string;
        label: string;
    }[];
};

export { config as conditionManager };
