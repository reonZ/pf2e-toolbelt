import {
    CharacterPF2e,
    ChatMessagePF2e,
    CheckContextChatFlag,
    CheckRoll,
    CheckRollCallback,
    DEGREE_STRINGS,
    DegreeAdjustmentAmount,
    DegreeOfSuccess,
    DegreeOfSuccessString,
    eventToRollParams,
    extractNotes,
    getActiveModule,
    R,
    RawModifier,
    RollNotePF2e,
    RollNoteSource,
    SaveType,
    TokenDocumentPF2e,
    waitDialog,
} from "module-helpers";
import { getItem, isMessageOwner, TargetHelperTool } from ".";
import { RerollType, TargetsData } from "..";

function showGhostDiceOnPrivate() {
    const dsn = getActiveModule("dice-so-nice");
    return !!dsn && dsn.getSetting<"0" | "1" | "2">("showGhostDice") !== "0";
}

function roll3dDice(
    roll: Rolled<CheckRoll>,
    target: TokenDocumentPF2e,
    isPrivate: boolean
): Promise<boolean> | undefined {
    if (!game.dice3d) return;

    const speaker = ChatMessage.getSpeaker({ token: target });

    if (!isPrivate && (target.hasPlayerOwner || !showGhostDiceOnPrivate())) {
        return game.dice3d.showForRoll(roll, game.user, true, null, false, null, speaker);
    }

    const cloneRoll = Roll.fromTerms(roll.terms) as Rolled<CheckRoll> & { ghost: boolean };
    cloneRoll.ghost = true;

    game.dice3d.showForRoll(cloneRoll, game.user, true, null, true, null, speaker);
    return game.dice3d.showForRoll(roll, game.user, false, null, false, null, speaker);
}

async function rollSaves(
    this: TargetHelperTool,
    event: MouseEvent,
    message: ChatMessagePF2e,
    data: TargetsData,
    targets: TokenDocumentPF2e[]
) {
    const dataSave = data.save;
    if (!dataSave) return;

    const extraRollOptions = data.extraRollOptions;
    const item = await getItem(message, data);

    const user = game.user;
    const origin = message.actor;
    const skipDefault = !user.settings.showCheckDialogs;
    const skipDialog = targets.length > 1 || (event.shiftKey ? !skipDefault : skipDefault);
    const rollParams = eventToRollParams(event, { type: "check" });
    const updates: Record<string, SaveRollData> = {};

    const targetsRollsPromise = targets.map((target) => {
        if (data.targetSave(target.id)) return;

        const statistic = target.actor?.getStatistic(dataSave.statistic);
        if (!statistic) return;

        return new Promise<void>((resolve) => {
            const callback: CheckRollCallback = async (roll, success, msg) => {
                const isPrivate =
                    msg.whisper.filter((userId) => game.users.get(userId)?.isGM).length > 0;

                await roll3dDice(roll, target, isPrivate);

                const context = msg.getFlag("pf2e", "context") as CheckContextChatFlag;
                const modifiers = msg.getFlag("pf2e", "modifiers") as RawModifier[];

                const rollData: SaveRollData = {
                    die: (roll.terms[0] as foundry.dice.terms.NumericTerm).total,
                    dosAdjustments: context.dosAdjustments,
                    modifiers: modifiers
                        .filter((modifier) => modifier.enabled)
                        .map(({ label, modifier }) => ({ label, modifier })),
                    notes: context.notes,
                    private: isPrivate,
                    roll: JSON.stringify(roll.toJSON()),
                    significantModifiers: window.pf2eMm?.getSignificantModifiersOfMessage(msg),
                    statistic: dataSave.statistic,
                    success: success!,
                    unadjustedOutcome: context.unadjustedOutcome,
                    value: roll.total,
                };

                updates[target.id] = rollData;

                Hooks.callAll("pf2e-toolbelt.rollSave", {
                    roll,
                    message,
                    rollMessage: msg,
                    target,
                    data: rollData,
                } satisfies RollSaveHook);

                resolve();
            };

            statistic.check.roll({
                ...rollParams,
                dc: { value: dataSave.dc },
                item,
                origin,
                skipDialog,
                extraRollOptions,
                createMessage: false,
                callback,
            });
        });
    });

    const filteredTargetsRollsPromise = targetsRollsPromise.filter(R.isTruthy);
    if (!filteredTargetsRollsPromise.length) return;

    await Promise.all(filteredTargetsRollsPromise);

    if (isMessageOwner(message)) {
        data.updateSaves(updates);
        data.setFlag();
    } else {
        this.updateMessageEmitable.emit({
            message,
            saves: updates,
        });
    }
}

async function rerollSave(
    this: TargetHelperTool,
    message: ChatMessagePF2e,
    data: TargetsData,
    target: TokenDocumentPF2e
) {
    const dataSave = data.save;
    const actor = target.actor;
    const targetSave = data.targetSave(target.id);
    if (!dataSave || !actor || !targetSave || targetSave.rerolled) return;

    const rerolls = R.entries(TargetHelperTool.REROLL);

    if (!actor.isOfType("character") || actor.heroPoints.value <= 0) {
        rerolls.findSplice(([type]) => type === "hero");
    }

    const options = rerolls.map(([type, { icon, reroll }], i) => {
        const label = game.i18n.localize(reroll);
        const checked = i === 0 ? "checked" : "";

        return `<label>
            <input type="radio" name="reroll" value="${type}" ${checked}>
            <i class="${icon}"></i> ${label}
        </label>`;
    });

    const result = await waitDialog<{ reroll: RerollType }>({
        content: options.join(""),
        i18n: `${this.key}.reroll`,
        yes: {
            icon: "fa-solid fa-rotate rotate",
        },
        classes: ["reroll"],
    });

    if (!result) return;

    const reroll = result.reroll;
    const isHeroReroll = reroll === "hero";
    const keep = isHeroReroll ? "new" : reroll;

    if (isHeroReroll) {
        const { value, max } = (actor as CharacterPF2e).heroPoints;

        if (value < 1) {
            this.warning("reroll.noPoints");
            return;
        }

        await actor.update({
            "system.resources.heroPoints.value": Math.clamp(value - 1, 0, max),
        });
    }

    const oldRoll = Roll.fromJSON(targetSave.roll) as Rolled<CheckRoll>;
    const unevaluatedNewRoll = oldRoll.clone() as CheckRoll;
    unevaluatedNewRoll.options.isReroll = true;

    Hooks.callAll(
        "pf2e.preReroll",
        Roll.fromJSON(targetSave.roll),
        unevaluatedNewRoll,
        isHeroReroll,
        keep
    );

    const newRoll = await unevaluatedNewRoll.evaluate({ allowInteractive: !targetSave.private });
    await roll3dDice(newRoll, target, targetSave.private);

    Hooks.callAll("pf2e.reroll", Roll.fromJSON(targetSave.roll), newRoll, isHeroReroll, keep);

    const keptRoll =
        (keep === "higher" && oldRoll.total > newRoll.total) ||
        (keep === "lower" && oldRoll.total < newRoll.total)
            ? oldRoll
            : newRoll;

    if (keptRoll === newRoll) {
        const success = new DegreeOfSuccess(newRoll, dataSave.dc, targetSave.dosAdjustments);
        keptRoll.options.degreeOfSuccess = success.value;
    }

    const extraRollOptions = data.extraRollOptions;
    const domains = actor.saves?.[dataSave.statistic]?.domains ?? [];
    const outcome = DEGREE_STRINGS[keptRoll.degreeOfSuccess!];

    const notes = R.pipe(
        [...extractNotes(actor.synthetics.rollNotes, domains)],
        R.map((note) => {
            return note instanceof RollNotePF2e ? note : new RollNotePF2e(note);
        }),
        R.filter((note) => {
            const test = note.predicate.test([
                ...extraRollOptions,
                ...(note.rule?.item.getRollOptions("parent") ?? []),
            ]);
            return test && (!note.outcome.length || (outcome && note.outcome.includes(outcome)));
        })
    );

    const rollData: SaveRollData = {
        die: (keptRoll.terms[0] as foundry.dice.terms.NumericTerm).total,
        dosAdjustments: foundry.utils.deepClone(targetSave.dosAdjustments),
        modifiers: foundry.utils.deepClone(targetSave.modifiers),
        notes: notes.map((note) => note.toObject()),
        private: targetSave.private,
        rerolled: reroll,
        roll: JSON.stringify(keptRoll.toJSON()),
        significantModifiers: window.pf2eMm?.getSignificantModifiersOfMessage({
            ...message,
            rolls: [newRoll],
        }),
        statistic: dataSave.statistic,
        success: outcome,
        value: keptRoll.total,
    };

    if (keptRoll.options.keeleyAdd10) {
        rollData.modifiers.push({
            label: this.localize("reroll.keeley"),
            modifier: 10,
        });
    }

    Hooks.callAll("pf2e-toolbelt.rerollSave", {
        oldRoll,
        newRoll,
        keptRoll,
        message,
        target,
        data: rollData,
    } satisfies RerollSaveHook);

    const updates = { [target.id]: rollData };

    if (isMessageOwner(message)) {
        data.updateSaves(updates);
        data.setFlag();
    } else {
        this.updateMessageEmitable.emit({
            message,
            saves: updates,
        });
    }
}

type SaveRollData = {
    die: number;
    dosAdjustments?: Record<string, { label: string; amount: DegreeAdjustmentAmount }>;
    modifiers: { label: string; modifier: number }[];
    notes: RollNoteSource[];
    private: boolean;
    rerolled?: "hero" | "new" | "lower" | "higher";
    roll: string;
    significantModifiers?: {
        appliedTo: "roll" | "dc";
        name: string;
        significance: "ESSENTIAL" | "HELPFUL" | "NONE" | "HARMFUL" | "DETRIMENTAL";
        value: number;
    }[];
    statistic: SaveType;
    success: DegreeOfSuccessString;
    unadjustedOutcome?: DegreeOfSuccessString | null;
    value: number;
};

type RollSaveHook = {
    roll: Rolled<CheckRoll>;
    message: ChatMessagePF2e;
    rollMessage: ChatMessagePF2e;
    target: TokenDocumentPF2e;
    data: SaveRollData;
};

type RerollSaveHook = {
    oldRoll: Rolled<CheckRoll>;
    newRoll: Rolled<CheckRoll>;
    keptRoll: Rolled<CheckRoll>;
    message: ChatMessagePF2e;
    target: TokenDocumentPF2e;
    data: SaveRollData;
};

export { rerollSave, rollSaves };
export type { SaveRollData };
