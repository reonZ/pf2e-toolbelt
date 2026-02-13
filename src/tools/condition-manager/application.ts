import { addListenerAll, createCustomCondition, R } from "foundry-helpers";
import { ActorPF2e, CombatantPF2e, ConditionPF2e, DurationData, EncounterPF2e } from "foundry-pf2e";
import { ModuleToolApplication } from "module-tool-application";
import { ConditionManagerTool } from ".";

class ConditionManager extends ModuleToolApplication<ConditionManagerTool> {
    #label: string;
    #actor: ActorPF2e;
    #combat: EncounterPF2e | null;
    #combatant: CombatantPF2e | null;
    #origin: CombatantPF2e | null;
    #condition: ConditionPF2e<ActorPF2e>;
    #counter: { value: number; default: number };
    #duration: DurationData;
    #unidentified: boolean;

    static DEFAULT_OPTIONS: DeepPartial<fa.ApplicationConfiguration> = {
        id: "pf2e-toolbelt-condition-manager",
    };

    constructor(
        tool: ConditionManagerTool,
        condition: ConditionPF2e<ActorPF2e>,
        options: DeepPartial<fa.ApplicationConfiguration> = {},
    ) {
        super(tool, options);

        this.#label = "";
        this.#actor = condition.actor;
        this.#condition = condition;
        this.#combatant = this.#actor.combatant;
        this.#combat = this.#combatant?.encounter ?? null;
        this.#origin = this.#combat?.combatant ?? this.#combatant;
        this.#unidentified = false;

        this.#duration = {
            expiry: "turn-start",
            unit: "rounds",
            value: 1,
        };

        this.#counter = {
            value: condition.system.value.value ?? 1,
            default: condition.system.value.value ?? 1,
        };
    }

    get key(): string {
        return "manager";
    }

    get title(): string {
        return this.localize("title", this.#condition._source);
    }

    get hasCounter(): boolean {
        return this.#condition.system.value.isValued;
    }

    get hasValue(): boolean {
        return !["unlimited", "encounter"].includes(this.#duration.unit);
    }

    get effectLabel(): string {
        const base = game.i18n.localize("TYPES.Item.effect");
        const label = `${base}: ${this.#condition.name}`;

        return this.#origin && this.#origin !== this.#combatant ? `${label} (${this.#origin.name})` : label;
    }

    async _prepareContext(_options: fa.ApplicationRenderOptions): Promise<RenderContext> {
        const isGM = game.user.isGM;
        const anonLabel = `<${this.tool.localize("anonymous")}>`;

        const labelPlaceholder = this.effectLabel;
        const label = {
            placeholder: labelPlaceholder,
            value: this.#label || labelPlaceholder,
        };

        const combatants = R.pipe(
            this.#combat?.combatants.contents ?? [],
            R.filter((combatant) => !!combatant.actor),
            R.map((combatant) => {
                return {
                    value: combatant.id,
                    label: isGM || combatant.playersCanSeeName ? combatant.name : anonLabel,
                };
            }),
        );

        const origin = combatants.length ? { combatants, selected: this.#origin!.id } : null;

        return {
            isGM,
            label,
            origin,
            hasValue: this.hasValue,
            duration: this.#duration,
            unidentified: this.#unidentified,
            timeUnits: CONFIG.PF2E.timeUnits,
            counter: this.hasCounter ? this.#counter : undefined,
            expiryOptions: [
                { value: "turn-start", label: "PF2E.Item.Effect.Expiry.StartOfTurn" },
                { value: "turn-end", label: "PF2E.Item.Effect.Expiry.EndOfTurn" },
                { value: "round-end", label: "PF2E.Item.Effect.Expiry.EndOfRound" },
            ],
        };
    }

    async _onClickAction(_event: PointerEvent, target: HTMLElement) {
        const action = target.dataset.action as "add" | "cancel";

        if (action === "add") {
            this.#createEffect();
        }

        this.close();
    }

    #createEffect() {
        const origin =
            this.#origin?.actor && this.#origin !== this.#combatant
                ? { actor: this.#origin.actor, token: this.#origin.token }
                : undefined;

        const effect = createCustomCondition({
            slug: this.#condition.slug,
            counter: this.#counter.value,
            duration: {
                unit: this.#duration.unit,
                expiry: this.#duration.expiry,
                value: this.#duration.value,
                origin,
            },
            name: this.#label || this.effectLabel,
            unidentified: this.#unidentified,
        });

        if (effect) {
            this.#actor.createEmbeddedDocuments("Item", [effect]);
        }
    }

    protected _activateListeners(html: HTMLElement) {
        type EventChangeName =
            | "label"
            | "origin"
            | "system.badge.value"
            | "system.duration.unit"
            | "system.duration.expiry"
            | "system.duration.value"
            | "system.unidentified";

        addListenerAll(html, "[name]", "change", (el: HTMLInputElement) => {
            const input = el.name as EventChangeName;

            if (input === "label") {
                this.#label = el.value.trim();
            } else if (input === "origin") {
                this.#origin = this.#combat?.combatants.get(el.value) ?? null;
            } else if (input === "system.badge.value") {
                const value = el.valueAsNumber;

                this.#counter.value = isNaN(value) ? this.#counter.default : Math.max(el.valueAsNumber, 1);
            } else if (input === "system.duration.expiry") {
                this.#duration.expiry = el.value as DurationData["expiry"];
            } else if (input === "system.duration.unit") {
                const value = el.value as DurationData["unit"];
                const isUnit = !["unlimited", "encounter"].includes(value);

                this.#duration.unit = value;
                this.#duration.value = isUnit ? 1 : -1;
                this.#duration.expiry = isUnit ? "turn-start" : null;
            } else if (input === "system.duration.value") {
                this.#duration.value = Math.max(el.valueAsNumber || 0, 0);
            } else if (input === "system.unidentified") {
                this.#unidentified = el.checked;
            }

            this.render();
        });
    }
}

type RenderContext = fa.ApplicationRenderContext & {
    isGM: boolean;
    duration: DurationData;
    unidentified: boolean;
    hasValue: boolean;
    origin: { combatants: { value: string; label: string }[]; selected: string } | null;
    timeUnits: typeof CONFIG.PF2E.timeUnits;
    counter: { value: number; default: number } | undefined;
    label: { value: string; placeholder: string };
    expiryOptions: {
        value: string;
        label: string;
    }[];
};

export { ConditionManager };
