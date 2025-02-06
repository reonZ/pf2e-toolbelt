import {
    ActorPF2e,
    ApplicationClosingOptions,
    ApplicationConfiguration,
    ApplicationRenderOptions,
    ConditionPF2e,
    DurationData,
    EffectContextData,
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
    #origin: { context: EffectContextData; value: boolean } | null;
    #counter: { value: number; default: number } | undefined;
    #rule: GrantItemSource & { alterations: any[] };
    #effect: PreCreate<EffectSource> & {
        system: { unidentified: boolean; duration: DurationData };
    };

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

        this.#rule = {
            key: "GrantItem",
            uuid: condition.sourceId,
            onDeleteActions: {
                grantee: "restrict",
            },
            inMemoryOnly: true,
            alterations: [],
        };

        if (condition._source.system.persistent) {
            this.#rule.alterations.push({
                mode: "override",
                property: "persistent-damage",
                value: condition._source.system.persistent,
            });
        }

        this.#effect = {
            type: "effect",
            name: `${game.i18n.localize("TYPES.Item.effect")}: ${condition.name}`,
            img: condition.img,
            system: {
                tokenIcon: { show: false },
                unidentified: false,
                duration: {
                    expiry: "turn-start",
                    unit: "rounds",
                    value: 1,
                },
                rules: [this.#rule],
            },
        };

        const origin = this.#actor.combatant?.encounter.combatant;
        const originActorUUID = origin?.actor?.uuid;

        this.#origin =
            originActorUUID && originActorUUID !== this.#actor.uuid
                ? {
                      context: {
                          origin: {
                              actor: originActorUUID,
                              token: origin.token?.uuid ?? null,
                              item: null,
                              spellcasting: null,
                          },
                          roll: null,
                          target: null,
                      },
                      value: true,
                  }
                : null;

        this.#counter = condition.system.value.isValued
            ? {
                  value: condition.system.value.value ?? 1,
                  default: condition.system.value.value ?? 1,
              }
            : undefined;
    }

    get system() {
        return this.#effect.system;
    }

    async close(options: ApplicationClosingOptions = {}): Promise<this> {
        options.animate = false;
        return super.close(options);
    }

    async _prepareContext(options: ApplicationRenderOptions): Promise<ConditionManagerContext> {
        return {
            isGM: game.user.isGM,
            data: this.system,
            origin: this.#origin?.value ?? null,
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
        if (this.#counter && this.#counter.value > 1) {
            this.#rule.alterations.push({
                mode: "override",
                property: "badge-value",
                value: this.#counter.value,
            });
        }

        if (this.#origin?.value) {
            this.system.context = this.#origin.context;
        }

        this.#actor.createEmbeddedDocuments("Item", [this.#effect]);
    }

    #activateListeners(html: HTMLElement) {
        addListener(
            html,
            "[name='system.duration.unit']",
            "change",
            (event, el: HTMLSelectElement) => {
                const value = el.value as DurationData["unit"];
                const isUnit = !["unlimited", "encounter"].includes(value);

                this.system.duration.unit = value;
                this.system.duration.value = isUnit ? 1 : -1;
                this.system.duration.expiry = isUnit ? "turn-start" : null;

                this.render();
            }
        );

        addListenerAll(html, "[name]", "change", (event, el: HTMLInputElement) => {
            switch (el.name as EventChangeName) {
                case "origin": {
                    this.#origin!.value = el.checked;
                    return;
                }

                case "system.badge.value": {
                    const value = el.valueAsNumber;

                    this.#counter!.value = isNaN(value)
                        ? this.#counter!.default
                        : Math.max(el.valueAsNumber, 1);

                    return this.render();
                }

                case "system.duration.unit": {
                    const value = el.value as DurationData["unit"];
                    const isUnit = !["unlimited", "encounter"].includes(value);

                    this.system.duration.unit = value;
                    this.system.duration.value = isUnit ? 1 : -1;
                    this.system.duration.expiry = isUnit ? "turn-start" : null;

                    return this.render();
                }

                case "system.duration.expiry": {
                    this.system.duration.expiry = el.value as DurationData["expiry"];
                    return;
                }

                case "system.duration.value": {
                    this.system.duration.value = Math.max(el.valueAsNumber || 0, 0);
                    return this.render();
                }

                case "system.unidentified": {
                    this.system.unidentified = el.checked;
                    return;
                }
            }
        });

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

type EventChangeName =
    | "origin"
    | "system.badge.value"
    | "system.duration.unit"
    | "system.duration.expiry"
    | "system.duration.value"
    | "system.unidentified";

type ConditionManagerData = {
    duration: DurationData;
    unidentified: boolean;
};

type ConditionManagerContext = {
    isGM: boolean;
    data: ConditionManagerData;
    origin: boolean | null;
    timeUnits: typeof CONFIG.PF2E.timeUnits;
    counter: { value: number; default: number } | undefined;
    expiryOptions: {
        value: string;
        label: string;
    }[];
};

export { config as conditionManager };
