import {
    ArithmeticExpression,
    ChatMessagePF2e,
    DamageInstance,
    DamageRoll,
    DamageType,
    DegreeOfSuccessString,
    getDamageRollClass,
    GroupingData,
    MaterialDamageEffect,
    R,
    Rolled,
    RollJSON,
    RollTermData,
    SYSTEM,
} from "foundry-helpers";
import { getMessageMergeData, setMessageMergeUpdateFlags } from ".";
import { BetterChatTool } from "..";

async function mergeDamages(
    this: BetterChatTool,
    targetMessage: ChatMessagePF2e,
    originMessage: ChatMessagePF2e,
    options: MergeOptions,
): Promise<ChatMessagePF2e | undefined> {
    const groups: Record<string, MessageGroup> = {};
    const damageLabel = game.i18n.localize("PF2E.DamageRoll");

    const data = [
        ...getMessageMergeData.call(this, originMessage), //
        ...getMessageMergeData.call(this, targetMessage),
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

        const exists = group.results.find((result) => result.outcome === outcome && result.modifiers === modifiers);

        if (exists) {
            exists.count++;
        } else {
            group.results.push({
                outcome,
                modifiers,
                label: game.i18n.localize(`PF2E.Check.Result.Degree.Attack.${outcome ?? "success"}`),
                count: 1,
            });
        }
    }

    const { rolls, showBreakdown } = groupRolls(targetMessage, originMessage, options);

    const messageData: ChatMessageData = {
        flavor: await this.render("merged", {
            groups,
            showBreakdown,
        }),
        speaker: targetMessage.speaker,
        flags: {
            [SYSTEM.id]: {
                context: {
                    options: R.unique(data.flatMap(({ options }) => options)),
                },
            },
        },
        rolls,
        sound: null,
    };

    setMessageMergeUpdateFlags.call(this, messageData, targetMessage, data);

    const ChatMessagePF2e = getDocumentClass("ChatMessage");

    if (options.updateMessages !== false) {
        await ChatMessage.deleteDocuments([targetMessage.id, originMessage.id]);
        return ChatMessagePF2e.create(messageData as any);
    } else {
        return new ChatMessagePF2e(messageData as any);
    }
}

async function injectDamage(
    this: BetterChatTool,
    targetMessage: ChatMessagePF2e,
    originMessage: ChatMessagePF2e,
    options: MergeOptions,
): Promise<{ rolls: RollJSON[] }> {
    // since the previous message shouldn't be modified, we don't want to update its rolls
    delete options.targetMerge;

    const { rolls } = groupRolls(originMessage, targetMessage, options);
    const data = [
        ...getMessageMergeData.call(this, originMessage), //
        ...getMessageMergeData.call(this, targetMessage),
    ];

    const updates = { rolls };

    setMessageMergeUpdateFlags.call(this, updates, originMessage, data);
    this.setFlagProperty(updates, "injected", true);

    if (options.updateMessages !== false) {
        await targetMessage.delete();
        originMessage.update(updates);
    }

    return updates;
}

function getRoll(roll: Rolled<foundry.dice.Roll>, mergeType: MergeType = "full"): Rolled<DamageRoll> {
    return (mergeType === "full" ? roll : roll.alter(mergeType === "double" ? 2 : 0.5, 0)) as Rolled<DamageRoll>;
}

function groupRolls(
    targetMessage: ChatMessagePF2e,
    originMessage: ChatMessagePF2e,
    { originMerge, targetMerge }: MergeOptions,
) {
    const groupedInstances: GroupedInstance[] = [];
    const messageRoll = getRoll(targetMessage.rolls[0], targetMerge);
    const otherRoll = getRoll(originMessage.rolls[0], originMerge);

    for (const roll of [otherRoll, messageRoll]) {
        const instances = roll.instances as Rolled<DamageInstance>[];

        for (const instance of instances) {
            const exists = groupedInstances.find(
                (x) => x.type === instance.type && x.persistent === instance.persistent,
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
                    term: null,
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
                { value: 0, index: -1 },
            );

            group.formulas = [group.formulas[index]];
            group.terms = [group.terms[index]];
        }

        const type = R.filter(
            [group.type, group.persistent ? "persistent" : undefined, ...group.materials],
            R.isTruthy,
        ).join(",");

        group.formula = `(${group.formulas.join(" + ")})[${type}]`;
        group.term = group.terms.length < 2 ? group.terms[0] : createTermGroup(group.terms);
    }

    const showBreakdown = messageRoll.options.showBreakdown && otherRoll.options.showBreakdown;
    const ignoredResistances = ((messageRoll.options.ignoredResistances ?? []) as string[]).concat(
        (otherRoll.options.ignoredResistances ?? []) as string[],
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
                rolls: groupedInstances.map(({ formula, total, term, type, materials, persistent }) => ({
                    class: "DamageInstance",
                    options: {
                        flavor: R.pipe(
                            [type, persistent ? "persistent" : undefined, ...materials],
                            R.filter(R.isTruthy),
                            R.join(","),
                        ),
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

    const rolls: RollJSON[] = [roll];

    for (const [msg, mergeType] of [
        [originMessage, originMerge],
        [targetMessage, targetMerge],
    ] as const) {
        if (msg.rolls.length > 1) {
            rolls.push(...msg.rolls.slice(1).map((roll) => getRoll(roll, mergeType).toJSON()));
        }
    }

    return { rolls, showBreakdown };
}

function createTermGroup(
    terms: RollTermData[],
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

type MessageGroup = {
    label: string;
    tags: string;
    notes: string[];
    results: {
        outcome: Maybe<DegreeOfSuccessString>;
        modifiers: string;
        label: string;
        count: number;
    }[];
};

type GroupedInstance = {
    type: DamageType;
    persistent: boolean;
    total: number;
    materials: Set<MaterialDamageEffect>;
    formulas: string[];
    formula: string;
    terms: RollTermData[];
    term: RollTermData | GroupingData | null;
};

type MergeType = toolbelt.mergeDamage.MergeType;
type MergeOptions = toolbelt.mergeDamage.MergeOptions;

export { injectDamage, mergeDamages };
export type { MergeOptions, MergeType };
