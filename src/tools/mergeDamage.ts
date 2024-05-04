import {
    R,
    addListener,
    compareArrays,
    createHTMLFromString,
    getDamageRollClass,
    htmlElement,
    latestChatMessages,
    querySelector,
    refreshLatestMessages,
} from "pf2e-api";
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

    const html = htmlElement($html);
    const template = await render("buttons", {
        merged: getFlag(message, "merged"),
    });
    const buttons = createHTMLFromString(template);
    const targets = getTargets(message);

    querySelector(html, ".dice-result .dice-total").append(buttons);

    addListener(buttons, "[data-action='merge-damage']", (event) => {
        event.stopPropagation();

        for (const { message: otherMessage } of latestChatMessages<ChatMessagePF2e>(5, message)) {
            if (otherMessage.actor !== actor || !isDamageRoll(otherMessage)) continue;

            const otherTargets = getTargets(otherMessage);
            if (!compareArrays(targets, otherTargets)) continue;

            mergeDamages(message, otherMessage);
            return;
        }

        localize.warn("noMatch");
    });

    addListener(buttons, "[data-action='split-damage']", async (event) => {
        event.stopPropagation();

        const sources = getFlag<MessageData[]>(message, "data")?.flatMap((data) => data.source);

        if (sources) {
            await message.delete();
            ChatMessage.implementation.createDocuments(sources);
        }
    });
}

async function mergeDamages(message: ChatMessagePF2e, otherMessage: ChatMessagePF2e) {
    const groups: Record<string, MessageGroup> = {};
    const data = getMessageData(otherMessage).concat(getMessageData(message));
    const damageLabel = game.i18n.localize("PF2E.DamageRoll");

    for (const { name, notes, tags, modifiers, outcome } of data) {
        groups[name] ??= {
            label: `${damageLabel}: ${name}`,
            tags,
            notes: [],
            results: [],
        };

        if (notes && !groups[name].notes.includes(notes)) {
            groups[name].notes.push(notes);
        }

        const exists = groups[name].results.find(
            (result) => result.outcome === outcome && result.modifiers === modifiers
        );

        if (exists) {
            exists.count++;
        } else {
            groups[name].results.push({
                outcome,
                modifiers,
                label: game.i18n.localize(`PF2E.Check.Result.Degree.Attack.${outcome}`),
                count: 1,
            });
        }
    }

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

        group.formula = `(${group.formulas.join(" + ")})[${group.type}]`;
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
                rolls: groupedInstances.map(({ formula, total, term, type, materials }) => ({
                    class: "DamageInstance",
                    options: {
                        flavor: [type, ...materials].join(","),
                    },
                    dice: [],
                    formula,
                    total,
                    terms: [term],
                    evaluated: true,
                })),
                results: groupedInstances.map(({ total }) => ({
                    result: total,
                    active: true,
                })),
            },
        ],
    };

    await ChatMessage.deleteDocuments([message.id, otherMessage.id]);

    const rolls: RollJSON[] = [roll];

    for (const msg of [otherMessage, message]) {
        if (msg.rolls.length > 1) {
            rolls.push(...msg.rolls.slice(1).map((roll) => roll.toJSON()));
        }
    }

    const messageData: ChatMessageCreateData = {
        flavor: await render("merged", {
            groups,
            showBreakdown,
        }),
        type: CONST.CHAT_MESSAGE_TYPES.ROLL,
        speaker: message.speaker,
        flags: {
            pf2e: {
                context: {
                    options: R.uniq(data.flatMap(({ options }) => options)),
                },
            },
        },
        rolls,
    };

    setTargetHelperFlagProperty(messageData, "targets", getTargets(message));

    setFlagProperty(messageData, "type", "damage-roll");
    setFlagProperty(messageData, "merged", true);
    setFlagProperty(messageData, "data", data);

    ChatMessage.implementation.create(messageData);
}

function createTermGroup(terms: RollTermData[]): GroupingData {
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

    const source = message.toObject() as PreCreate<ChatMessageSourceData>;
    delete source._id;
    delete source.timestamp;

    const sourceFlag = source.flags!.pf2e as DamageDamageFlag;
    const flavor = createHTMLFromString(message.flavor);
    const tags = flavor.querySelector(":scope > h4.action + .tags")?.outerHTML.trim() ?? "";
    const modifiers = flavor.querySelector(":scope > .tags.modifiers")?.outerHTML.trim() ?? "";
    const notes = flavor.querySelector(":scope > .notes")?.outerHTML.trim() ?? "";
    const options = sourceFlag.context.options.filter((option) => /^(item|self):/.test(option));

    return [
        {
            source,
            name: sourceFlag.strike?.name ?? message.item!.name,
            outcome: sourceFlag.context.outcome,
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
    source: PreCreate<ChatMessageSourceData>;
    name: string;
    notes: string;
    outcome: DegreeOfSuccessString | null;
    options: string[];
    modifiers: string;
    tags: string;
};

export { config as mergeDamageTool };
