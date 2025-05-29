import {
    ActorPF2e,
    CharacterPF2e,
    ChatMessagePF2e,
    CheckContextChatFlag,
    CheckRoll,
    CheckRollCallback,
    DEGREE_STRINGS,
    DegreeOfSuccess,
    eventToRollParams,
    extractNotes,
    getItemFromUuid,
    ItemPF2e,
    R,
    RawModifier,
    RollNotePF2e,
    selectTokens,
    TokenDocumentPF2e,
    waitDialog,
} from "module-helpers";
import { TargetHelperTool } from ".";
import { RerollType, TargetSaveSource, TargetsData } from "..";

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
    const item = ((await getItemFromUuid(data.item)) ?? message.item) as ItemPF2e<ActorPF2e>;

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

                // await roll3dDice(roll, target, isPrivate, false);

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

    if (user.isGM || message.isAuthor) {
        data.update({ saves: updates });
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
    // await roll3dDice(newRoll, target, targetSave.private, false);

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

    if (game.user.isGM || message.isAuthor) {
        data.update({ saves: updates });
        data.setFlag();
    } else {
        this.updateMessageEmitable.emit({
            message,
            saves: updates,
        });
    }
}

function addSaveBtnListener(
    this: TargetHelperTool,
    realBtn: HTMLButtonElement,
    fakeBtn: HTMLButtonElement,
    message: ChatMessagePF2e,
    data: TargetsData
) {
    const allTargets = data.targets.map((target) => target.uuid);

    fakeBtn.addEventListener("click", (event) => {
        event.preventDefault();

        const selected = game.user.getActiveTokens();
        const targets: TokenDocumentPF2e[] = [];
        const remainSelected: TokenDocumentPF2e[] = [];
        const clickEvent = new MouseEvent("click", event);

        for (const token of selected) {
            if (!data.targetSave(token.id) && allTargets.includes(token.uuid)) {
                targets.push(token);
            } else {
                remainSelected.push(token);
            }
        }

        if (remainSelected.length) {
            selectTokens(remainSelected);
        }

        if (remainSelected.length || !targets.length) {
            realBtn.dispatchEvent(clickEvent);
        }

        if (targets.length) {
            rollSaves.call(this, event, message, data, targets);
        }
    });
}

type SaveRollData = WithUndefined<
    WithPartial<TargetSaveSource, "rerolled" | "unadjustedOutcome">,
    "dosAdjustments" | "significantModifiers"
>;

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

export { addSaveBtnListener, rerollSave, rollSaves };
export type { SaveRollData };
