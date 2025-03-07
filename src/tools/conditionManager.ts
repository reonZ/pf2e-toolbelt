import {
    ActorPF2e,
    ApplicationClosingOptions,
    ApplicationConfiguration,
    ApplicationRenderOptions,
    CombatantPF2e,
    ConditionPF2e,
    DurationData,
    EffectSource,
    GrantItemSource,
    ItemPF2e,
    R,
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
    #origin: CombatantPF2e | null;
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
                // tokenIcon: { show: false },
                unidentified: false,
                duration: {
                    expiry: "turn-start",
                    unit: "rounds",
                    value: 1,
                },
                rules: [this.#rule],
            },
        };

        this.#origin = this.#actor.combatant;

        if (condition.system.value.isValued) {
            this.#rule.inMemoryOnly = true;

            this.#counter = {
                value: condition.system.value.value ?? 1,
                default: condition.system.value.value ?? 1,
            };
        }
    }

    get system() {
        return this.#effect.system;
    }

    async close(options: ApplicationClosingOptions = {}): Promise<this> {
        options.animate = false;
        return super.close(options);
    }

    async _prepareContext(options: ApplicationRenderOptions): Promise<ConditionManagerContext> {
        const combatants = R.pipe(
            this.#origin?.encounter?.combatants.contents ?? [],
            R.filter((combatant) => !!combatant.actor),
            R.map((combatant) => {
                return { value: combatant.id, label: combatant.name };
            })
        );

        return {
            isGM: game.user.isGM,
            data: this.system,
            origin: combatants.length ? { combatants, selected: this.#origin!.id } : null,
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

        if (this.#origin) {
            this.system.context = {
                origin: {
                    actor: this.#origin.actor!.uuid,
                    token: this.#origin.token?.uuid ?? null,
                    item: null,
                    spellcasting: null,
                },
                roll: null,
                target: null,
            };
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
                    this.#origin = this.#origin?.encounter?.combatants.get(el.value) ?? null;
                    break;
                }

                case "system.badge.value": {
                    const value = el.valueAsNumber;

                    this.#counter!.value = isNaN(value)
                        ? this.#counter!.default
                        : Math.max(el.valueAsNumber, 1);

                    break;
                }

                case "system.duration.unit": {
                    const value = el.value as DurationData["unit"];
                    const isUnit = !["unlimited", "encounter"].includes(value);

                    this.system.duration.unit = value;
                    this.system.duration.value = isUnit ? 1 : -1;
                    this.system.duration.expiry = isUnit ? "turn-start" : null;

                    break;
                }

                case "system.duration.expiry": {
                    this.system.duration.expiry = el.value as DurationData["expiry"];
                    break;
                }

                case "system.duration.value": {
                    this.system.duration.value = Math.max(el.valueAsNumber || 0, 0);
                    break;
                }

                case "system.unidentified": {
                    this.system.unidentified = el.checked;
                    break;
                }
            }

            this.render();
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
    origin: { combatants: { value: string; label: string }[]; selected: string } | null;
    timeUnits: typeof CONFIG.PF2E.timeUnits;
    counter: { value: number; default: number } | undefined;
    expiryOptions: {
        value: string;
        label: string;
    }[];
};

export { config as conditionManager };
