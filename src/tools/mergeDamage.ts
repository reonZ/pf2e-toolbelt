import {
    addListenerAll,
    ArithmeticExpression,
    ChatMessageFlagsPF2e,
    ChatMessagePF2e,
    ChatMessageSourcePF2e,
    createHook,
    createHTMLElement,
    DamageDamageContextFlag,
    DamageInstance,
    DamageRoll,
    DamageType,
    DegreeOfSuccessString,
    getDamageRollClass,
    GroupingData,
    htmlQuery,
    htmlQueryAll,
    latestChatMessages,
    MaterialDamageEffect,
    refreshLatestMessages,
    toggleHooksAndWrappers,
} from "module-helpers";
import { arraysEqual, DEGREE_STRINGS, R } from "module-helpers/src";
import { ModuleTool, ToolSettingsList } from "module-tool";

class MergeDamageTool extends ModuleTool<ToolSettings> {
    #injected: string | undefined;
    #icons: PartialRecord<ButtonType, string> = {};

    #hooks = [
        createHook("renderChatMessageHTML", this.#onRenderChatMessage.bind(this)),
        createHook("diceSoNiceMessageProcessed", this.#onDiceSoNiceMessageProcessed.bind(this)),
    ];

    static ICONS: Record<ButtonType, string> = {
        inject: "fa-solid fa-syringe",
        merge: "fa-duotone fa-merge",
        split: "fa-duotone fa-split",
    };

    get key(): "mergeDamage" {
        return "mergeDamage";
    }

    get settingsSchema(): ToolSettingsList<ToolSettings> {
        return [
            {
                key: "merge",
                type: Boolean,
                default: false,
                scope: "user",
                onChange: () => {
                    this.configurate();
                },
            },
            {
                key: "inject",
                type: Boolean,
                default: false,
                scope: "user",
                onChange: () => {
                    this.configurate();
                },
            },
        ];
    }

    init(): void {
        this._configurate();
    }

    _configurate(): void {
        toggleHooksAndWrappers(this.#hooks, this.settings.merge || this.settings.inject);
        refreshLatestMessages(20);
    }

    isDamageRoll(message: ChatMessagePF2e): boolean {
        return (
            this.getFlag(message, "type") === "damage-roll" ||
            message.getFlag("pf2e", "context.type") === "damage-roll"
        );
    }

    getMessageTargets(message: ChatMessagePF2e) {
        const targets = game.toolbelt!.api.targetHelper.getMessageTargets(message);
        if (targets.length) return targets;

        const target = message.getFlag("pf2e", "context.target.token") as string | undefined;
        return target ? [target] : [];
    }

    setMessageUpdateFlags(
        updates: Record<string, unknown>,
        message: ChatMessagePF2e,
        data: MessageData[]
    ) {
        const targets = this.getMessageTargets(message);
        game.toolbelt!.api.targetHelper.setMessageFlagTargets(updates, targets);

        this.setFlagProperties(updates, {
            type: "damage-roll",
            merged: true,
            data: data,
        });
    }

    getButton(type: ButtonType) {
        return (this.#icons[type] ??= (() => {
            const icon = MergeDamageTool.ICONS[type];
            const tooltip = this.localize("buttons", type);
            return `<button data-action="${type}-damage" title="${tooltip}">
                <i class="${icon}"></i>
            </button>`;
        })());
    }

    getInjectedIcon() {
        return (this.#injected ??= (() => {
            const tooltip = this.localize("injected");
            return `<i class="fa-solid fa-syringe" title="${tooltip}"></i> `;
        })());
    }

    getMessageData(message: ChatMessagePF2e): MessageData[] {
        const flag = this.getFlag<MessageData[]>(message, "data");
        if (flag) return flag;

        const source = message.toObject() as PreCreate<ChatMessageSourcePF2e>;

        delete source._id;
        delete source.timestamp;
        this.deleteFlagProperty(source, "splitted");

        const sourceFlag = source.flags!.pf2e as ChatMessageFlagsPF2e["pf2e"] & {
            context: DamageDamageContextFlag | SpellCastContextFlag;
            strike?: {
                actor: string;
                index: number;
                damaging: boolean;
                name: string;
                altUsage: null;
            };
        };

        const flavor = createHTMLElement("div", { content: message.flavor });
        const tags = flavor.querySelector(":scope > h4.action + .tags")?.outerHTML.trim() ?? "";
        const modifiers = flavor.querySelector(":scope > .tags.modifiers")?.outerHTML.trim() ?? "";
        const options = sourceFlag.context.options.filter((option) => /^(item|self):/.test(option));
        const notes = htmlQueryAll(flavor, ":scope > .notes > .roll-note").map((x) =>
            x.outerHTML.trim()
        );

        return [
            {
                source,
                name:
                    sourceFlag.strike?.name ??
                    message.item?.name ??
                    flavor.querySelector<HTMLHeadElement>(":scope > h4.action")?.innerText.trim() ??
                    "unknown",
                outcome: sourceFlag.context.outcome ?? null,
                options,
                modifiers,
                notes,
                tags,
            },
        ];
    }

    #onDiceSoNiceMessageProcessed(messageId: string, interception: { willTrigger3DRoll: boolean }) {
        const message = game.messages.get(messageId);

        if (message && (this.getFlag(message, "merged") || this.getFlag(message, "splitted"))) {
            interception.willTrigger3DRoll = false;
        }
    }

    async #onRenderChatMessage(message: ChatMessagePF2e, html: HTMLElement) {
        const actor = message.actor;
        if (!actor || (!game.user.isGM && !message.isAuthor) || !this.isDamageRoll(message)) return;

        const targets = this.getMessageTargets(message);
        const injected = this.getFlag(message, "injected");

        const buttons: ButtonType[] = [];

        if (injected || this.getFlag(message, "merged")) {
            buttons.push("split");
        } else {
            if (this.settings.inject) {
                buttons.push("inject");
            }
            if (this.settings.merge) {
                buttons.push("merge");
            }
        }

        const buttonsElement = createHTMLElement("div", {
            classes: ["pf2e-toolbelt-merge-buttons"],
            content: buttons.map((type) => this.getButton(type)).join(""),
        });

        htmlQuery(html, ".dice-result .dice-total")?.append(buttonsElement);

        if (injected) {
            const action = htmlQuery(html, ".message-header .flavor-text .action");
            action?.insertAdjacentHTML("afterbegin", this.getInjectedIcon());
        }

        addListenerAll(buttonsElement, "[data-action]", async (el, event) => {
            event.stopPropagation();

            type EventAction = "merge-damage" | "split-damage" | "inject-damage";
            const action = el.dataset.action as EventAction;

            switch (action) {
                case "merge-damage":
                case "inject-damage": {
                    for (const otherMessage of latestChatMessages(5, message)) {
                        if (otherMessage.actor !== actor || !this.isDamageRoll(otherMessage))
                            continue;

                        const otherTargets = this.getMessageTargets(otherMessage);
                        if (arraysEqual(targets, otherTargets)) {
                            if (action === "merge-damage") {
                                return this.#mergeDamages(message, otherMessage);
                            } else {
                                return this.#injectDamage(message, otherMessage);
                            }
                        }
                    }

                    return this.warning("noMatch");
                }

                case "split-damage": {
                    const flag = this.getFlag<MessageData[]>(message, "data");

                    const sources = flag?.flatMap((data) => {
                        const source = data.source;

                        source.sound = null;
                        this.setFlagProperty(source, "splitted", true);

                        return source;
                    });

                    if (sources?.length) {
                        await message.delete();
                        getDocumentClass("ChatMessage").createDocuments(sources);
                    }

                    return;
                }
            }
        });
    }

    async #mergeDamages(targetMessage: ChatMessagePF2e, originMessage: ChatMessagePF2e) {
        const groups: Record<string, MessageGroup> = {};
        const damageLabel = game.i18n.localize("PF2E.DamageRoll");

        const data = [
            ...this.getMessageData(originMessage), //
            ...this.getMessageData(targetMessage),
        ];

        for (const { name, notes, tags, modifiers, outcome } of data) {
            const group = (groups[name] ??= {
                label: `${damageLabel}: ${name}`,
                tags,
                notes: [],
                results: [],
            });

            for (const note of notes) {
                if (group.notes.includes(note)) continue;
                group.notes.push(note);
            }

            const exists = group.results.find(
                (result) => result.outcome === outcome && result.modifiers === modifiers
            );

            if (exists) {
                exists.count++;
            } else {
                group.results.push({
                    outcome,
                    modifiers,
                    label: game.i18n.localize(
                        `PF2E.Check.Result.Degree.Attack.${outcome ?? DEGREE_STRINGS[2]}`
                    ),
                    count: 1,
                });
            }
        }

        const { rolls, showBreakdown } = groupRolls(targetMessage, originMessage);

        await ChatMessage.deleteDocuments([targetMessage.id, originMessage.id]);

        const messageData: ChatMessageCreateData<ChatMessagePF2e> = {
            flavor: await this.render("merged", {
                groups,
                showBreakdown,
            }),
            speaker: targetMessage.speaker,
            flags: {
                pf2e: {
                    context: {
                        options: R.unique(data.flatMap(({ options }) => options)),
                    },
                },
            },
            rolls,
            sound: null,
        };

        this.setMessageUpdateFlags(messageData, targetMessage, data);

        getDocumentClass("ChatMessage").create(messageData);
    }

    async #injectDamage(targetMessage: ChatMessagePF2e, originMessage: ChatMessagePF2e) {
        const { rolls } = groupRolls(originMessage, targetMessage);
        const data = [
            ...this.getMessageData(originMessage), //
            ...this.getMessageData(targetMessage),
        ];

        await targetMessage.delete();

        const updates = { rolls };

        this.setMessageUpdateFlags(updates, originMessage, data);
        this.setFlagProperty(updates, "injected", true);

        originMessage.update(updates);
    }
}

function groupRolls(targetMessage: ChatMessagePF2e, originMessage: ChatMessagePF2e) {
    const groupedInstances: GroupedInstance[] = [];
    const messageRoll = targetMessage.rolls[0] as Rolled<DamageRoll>;
    const otherRoll = originMessage.rolls[0] as Rolled<DamageRoll>;

    for (const roll of [otherRoll, messageRoll]) {
        const instances = roll.instances as Rolled<DamageInstance>[];

        for (const instance of instances) {
            const exists = groupedInstances.find(
                (x) => x.type === instance.type && x.persistent === instance.persistent
            );

            if (exists) {
                exists.total += instance.total;
                exists.terms.push(...instance.toJSON().terms);
                exists.formulas.push(...instance.terms.map((x) => x.expression));
                for (const material of instance.materials) {
                    exists.materials.add(material);
                }
            } else {
                groupedInstances.push({
                    type: instance.type,
                    persistent: instance.persistent,
                    total: instance.total,
                    materials: new Set(instance.materials),
                    terms: instance.toJSON().terms.slice(),
                    formulas: instance.terms.map((x) => x.expression),
                    formula: "",
                    term: null as unknown as RollTermData,
                });
            }
        }
    }

    for (const group of groupedInstances) {
        if (group.persistent) {
            const DamageRoll = getDamageRollClass();
            const { index } = group.formulas.reduce(
                (prev, curr, index) => {
                    const value = new DamageRoll(curr).expectedValue;
                    if (value <= prev.value) return prev;
                    return { value, index };
                },
                { value: 0, index: -1 }
            );

            group.formulas = [group.formulas[index]];
            group.terms = [group.terms[index]];
        }

        const type = R.filter(
            [group.type, group.persistent ? "persistent" : undefined, ...group.materials],
            R.isTruthy
        ).join(",");

        group.formula = `(${group.formulas.join(" + ")})[${type}]`;
        group.term = group.terms.length < 2 ? group.terms[0] : createTermGroup(group.terms);
    }

    const showBreakdown = messageRoll.options.showBreakdown && otherRoll.options.showBreakdown;
    const ignoredResistances = ((messageRoll.options.ignoredResistances ?? []) as string[]).concat(
        (otherRoll.options.ignoredResistances ?? []) as string[]
    );

    const roll = {
        class: "DamageRoll",
        options: {
            critRule: messageRoll.options.critRule,
            ignoredResistances: ignoredResistances,
            showBreakdown,
        },
        ghost: true,
        dice: [],
        formula: `{${groupedInstances.map(({ formula }) => formula).join(", ")}}`,
        total: R.sumBy(groupedInstances, (x) => x.total),
        evaluated: true,
        terms: [
            {
                class: "InstancePool",
                options: {},
                evaluated: true,
                terms: groupedInstances.map(({ formula }) => formula),
                modifiers: [],
                rolls: groupedInstances.map(
                    ({ formula, total, term, type, materials, persistent }) => ({
                        class: "DamageInstance",
                        options: {
                            flavor: R.filter(
                                [type, persistent ? "persistent" : undefined, ...materials],
                                R.isTruthy
                            ).join(","),
                        },
                        dice: [],
                        formula,
                        total,
                        terms: [term],
                        evaluated: true,
                    })
                ),
                results: groupedInstances.map(({ total }) => ({
                    result: total,
                    active: true,
                })),
            },
        ],
    };

    const rolls: RollJSON[] = [roll];

    for (const msg of [originMessage, targetMessage]) {
        if (msg.rolls.length > 1) {
            rolls.push(...msg.rolls.slice(1).map((roll) => roll.toJSON()));
        }
    }

    return { rolls, showBreakdown };
}

function createTermGroup(
    terms: RollTermData[]
): RollTermData & { class?: "Grouping"; term: ReturnType<ArithmeticExpression["toJSON"]> } {
    return {
        class: "Grouping",
        options: {},
        evaluated: true,
        term: {
            class: "ArithmeticExpression",
            options: {},
            evaluated: true,
            operator: "+",
            operands: [terms.shift()!, terms.length > 1 ? createTermGroup(terms) : terms[0]],
        },
    };
}

type GroupedInstance = {
    type: DamageType;
    persistent: boolean;
    total: number;
    materials: Set<MaterialDamageEffect>;
    formulas: string[];
    formula: string;
    terms: RollTermData[];
    term: RollTermData | GroupingData;
};

type MessageGroup = {
    label: string;
    tags: string;
    notes: string[];
    results: {
        outcome: DegreeOfSuccessString | null;
        modifiers: string;
        label: string;
        count: number;
    }[];
};

type MessageData = {
    source: PreCreate<ChatMessageSourcePF2e>;
    name: string;
    notes: string[];
    outcome: DegreeOfSuccessString | null;
    options: string[];
    modifiers: string;
    tags: string;
};

interface SpellCastContextFlag {
    type: "spell-cast";
    domains: string[];
    options: string[];
    outcome?: DegreeOfSuccessString;
    /** The roll mode (i.e., 'roll', 'blindroll', etc) to use when rendering this roll. */
    rollMode?: RollMode;
}

type ButtonType = "merge" | "inject" | "split";

type ToolSettings = {
    merge: boolean;
    inject: boolean;
};

export { MergeDamageTool };
