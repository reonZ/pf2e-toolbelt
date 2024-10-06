import {
    DEGREE_OF_SUCCESS_STRINGS,
    R,
    addListenerAll,
    compareArrays,
    createHTMLElement,
    getDamageRollClass,
    htmlQuery,
    latestChatMessages,
    refreshLatestMessages,
} from "foundry-pf2e";
import { createTool } from "../tool";
import { getMessageTargets, setTargetHelperFlagProperty } from "./targetHelper";

const { config, settings, hook, localize, getFlag, render, setFlagProperty } = createTool({
    name: "mergeDamage",
    settings: [
        {
            key: "enabled",
            type: Boolean,
            default: false,
            scope: "client",
            onChange: (value) => {
                hook.toggle(value);
                refreshLatestMessages(20);
            },
        },
    ],
    hooks: [
        {
            event: "renderChatMessage",
            listener: onRenderChatMessage,
        },
    ],
    init: () => {
        hook.toggle(settings.enabled);
        refreshLatestMessages(20);
    },
} as const);

async function onRenderChatMessage(message: ChatMessagePF2e, $html: JQuery) {
    const actor = message.actor;
    if ((!game.user.isGM && !message.isAuthor) || !actor || !isDamageRoll(message)) return;

    const html = $html[0];
    const injected = getFlag<boolean>(message, "injected");
    const merged = injected || getFlag<boolean>(message, "merged");
    const targets = getTargets(message);

    const buttonsElement = createHTMLElement("div", {
        classes: ["pf2e-toolbelt-merge-buttons"],
        innerHTML: await render("buttons", { merged }),
    });

    htmlQuery(html, ".dice-result .dice-total")?.append(buttonsElement);

    if (injected) {
        htmlQuery(html, ".message-header .flavor-text .action")?.insertAdjacentHTML(
            "afterbegin",
            `<i class="fa-solid fa-syringe" title="${localize("injected")}"></i> `
        );
    }

    type EventAction = "merge-damage" | "split-damage" | "inject-damage";

    addListenerAll(buttonsElement, "[data-action]", async (event, el) => {
        event.stopPropagation();

        const action = el.dataset.action as EventAction;

        switch (action) {
            case "merge-damage":
            case "inject-damage": {
                for (const { message: otherMessage } of latestChatMessages(5, message)) {
                    if (otherMessage.actor !== actor || !isDamageRoll(otherMessage)) continue;

                    const otherTargets = getTargets(otherMessage);
                    if (compareArrays(targets, otherTargets)) {
                        if (action === "merge-damage") {
                            return mergeDamages(message, otherMessage);
                        } else {
                            return injectDamage(message, otherMessage);
                        }
                    }
                }
                return localize.warn("noMatch");
            }

            case "split-damage": {
                const flag = getFlag<MessageData[]>(message, "data");
                const sources = flag?.flatMap((data) => data.source);
                if (sources) {
                    await message.delete();
                    getDocumentClass("ChatMessage").createDocuments(sources);
                }
                break;
            }
        }
    });
}

function groupRolls(message: ChatMessagePF2e, otherMessage: ChatMessagePF2e) {
    const groupedInstances: GroupedInstance[] = [];
    const messageRoll = message.rolls[0] as Rolled<DamageRoll>;
    const otherRoll = otherMessage.rolls[0] as Rolled<DamageRoll>;

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
    const ignoredResistances = (messageRoll.options.ignoredResistances ?? []).concat(
        otherRoll.options.ignoredResistances ?? []
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

    for (const msg of [otherMessage, message]) {
        if (msg.rolls.length > 1) {
            rolls.push(...msg.rolls.slice(1).map((roll) => roll.toJSON()));
        }
    }

    return { rolls, showBreakdown };
}

function setMessageUpdateFlags(
    update: Record<string, unknown>,
    message: ChatMessagePF2e,
    data: MessageData[],
    injected: boolean
) {
    setTargetHelperFlagProperty(update, "targets", getTargets(message));

    setFlagProperty(update, "type", "damage-roll");
    setFlagProperty(update, injected ? "injected" : "merged", true);
    setFlagProperty(update, "data", data);
}

async function injectDamage(message: ChatMessagePF2e, otherMessage: ChatMessagePF2e) {
    const { rolls } = groupRolls(otherMessage, message);
    const data = getMessageData(otherMessage).concat(getMessageData(message));

    await message.delete();

    const update = { rolls };

    setMessageUpdateFlags(update, otherMessage, data, true);
    setFlagProperty(update, "injected", true);

    otherMessage.update(update);
}

async function mergeDamages(message: ChatMessagePF2e, otherMessage: ChatMessagePF2e) {
    const groups: Record<string, MessageGroup> = {};
    const data = getMessageData(otherMessage).concat(getMessageData(message));
    const damageLabel = game.i18n.localize("PF2E.DamageRoll");

    for (const { name, notes, tags, modifiers, outcome } of data) {
        const group = (groups[name] ??= {
            label: `${damageLabel}: ${name}`,
            tags,
            notes: [],
            results: [],
        });

        if (notes && !group.notes.includes(notes)) {
            group.notes.push(notes);
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
                    `PF2E.Check.Result.Degree.Attack.${outcome ?? DEGREE_OF_SUCCESS_STRINGS[2]}`
                ),
                count: 1,
            });
        }
    }

    const { rolls, showBreakdown } = groupRolls(message, otherMessage);

    await ChatMessage.deleteDocuments([message.id, otherMessage.id]);

    const messageData: ChatMessagePF2eCreateData = {
        flavor: await render("merged", {
            groups,
            showBreakdown,
        }),
        speaker: message.speaker,
        flags: {
            pf2e: {
                // @ts-ignore
                context: {
                    options: R.unique(data.flatMap(({ options }) => options)),
                },
            },
        },
        rolls,
    };

    setMessageUpdateFlags(messageData, message, data, false);

    getDocumentClass("ChatMessage").create(messageData);
}

function createTermGroup(terms: RollTermData[]): GroupingData<ArithmeticExpressionData> {
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

function getMessageData(message: ChatMessagePF2e): MessageData[] {
    const flag = getFlag<MessageData[]>(message, "data");
    if (flag) return flag;

    const source = message.toObject() as PreCreate<ChatMessageSourcePF2e>;
    delete source._id;
    delete source.timestamp;

    const sourceFlag = source.flags!.pf2e as ChatMessageFlagsPF2e["pf2e"] & {
        context: DamageDamageContextFlag | SpellCastContextFlag;
    };

    const flavor = createHTMLElement("div", { innerHTML: message.flavor });
    const tags = flavor.querySelector(":scope > h4.action + .tags")?.outerHTML.trim() ?? "";
    const modifiers = flavor.querySelector(":scope > .tags.modifiers")?.outerHTML.trim() ?? "";
    const notes = flavor.querySelector(":scope > .notes")?.outerHTML.trim() ?? "";
    const options = sourceFlag.context.options.filter((option) => /^(item|self):/.test(option));

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

function isDamageRoll(message: ChatMessagePF2e) {
    return (
        getFlag(message, "type") === "damage-roll" ||
        message.getFlag("pf2e", "context.type") === "damage-roll"
    );
}

function getTargets(message: ChatMessagePF2e) {
    const targets = getMessageTargets(message);
    if (targets.length) return targets;

    const target = message.getFlag<string>("pf2e", "context.target.token");
    return target ? [target] : [];
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
    notes: string;
    outcome: DegreeOfSuccessString | null;
    options: string[];
    modifiers: string;
    tags: string;
};

export { config as mergeDamageTool };
