import {
    ChatMessagePF2e,
    CheckContextChatFlag,
    CheckRoll,
    CheckRollCallback,
    DEGREE_STRINGS,
    DegreeAdjustmentAmount,
    DegreeOfSuccess,
    DegreeOfSuccessString,
    ErrorPF2e,
    eventToRollParams,
    extractNotes,
    getActiveModule,
    R,
    RawModifier,
    RollNotePF2e,
    RollNoteSource,
    SaveType,
    signedInteger,
    TokenDocumentPF2e,
    waitDialog,
} from "module-helpers";
import { getCheckRollClass } from "module-helpers/src";
import { getItem, TargetHelperTool } from ".";
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
                    data.isPrivate ||
                    msg.whisper.filter((userId) => game.users.get(userId)?.isGM).length > 0;

                await roll3dDice(roll, target, isPrivate);

                const context = msg.getFlag("pf2e", "context") as CheckContextChatFlag;

                const modifiers = R.pipe(
                    msg.getFlag("pf2e", "modifiers") as RawModifier[],
                    R.filter((modifier) => !!modifier.enabled),
                    R.map((modifier): SaveRollData["modifiers"][number] => {
                        return {
                            label: modifier.label,
                            modifier: modifier.modifier,
                            slug: modifier.slug ?? "unknown",
                        };
                    })
                );

                const rollData: SaveRollData = {
                    die: (roll.terms[0] as foundry.dice.terms.NumericTerm).total,
                    dosAdjustments: context.dosAdjustments,
                    modifiers,
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

    this.updateMessageEmitable.call({
        message,
        saves: updates,
        variantId: data.variantId,
    });
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
    const isCharacter = actor.isOfType("character");

    if (!isCharacter || actor.heroPoints.value <= 0) {
        rerolls.findSplice(([type]) => type === "hero");
    }

    if (!isCharacter || actor.system.resources.mythicPoints.value <= 0) {
        rerolls.findSplice(([type]) => type === "mythic");
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

    const keep = R.isIncludedIn(result.reroll, ["hero", "mythic"]) ? "new" : result.reroll;
    const resourceKey =
        result.reroll === "hero"
            ? "hero-points"
            : result.reroll === "mythic"
            ? "mythic-points"
            : "";

    const resource = actor.getResource(resourceKey);

    if (resource && isCharacter && resource.value < 1) {
        return ui.notifications.warn("PF2E.RerollMenu.WarnNoResource", {
            localize: true,
            format: {
                name: actor.name,
                resource: resource.label,
            },
        });
    }

    /**
     * reworked version of
     * https://github.com/foundryvtt/pf2e/blob/e28d75364626c4b396c02f702afa2c12de0cf6ee/src/module/system/check/check.ts#L509-L510
     */
    const oldRoll = Roll.fromJSON(targetSave.roll) as Rolled<CheckRoll>;
    const pwolVariant = game.pf2e.settings.variants.pwol.enabled;

    const unevaluatedNewRoll = ((): CheckRoll => {
        if (resource?.slug !== "mythic-points" || !actor.isOfType("character"))
            return oldRoll.clone();
        // Create a new CheckRoll in case of a mythic point reroll
        const proficiencyModifier = actor
            .getStatistic(targetSave.statistic)
            ?.modifiers.find((m) => m.slug === "proficiency");
        if (!proficiencyModifier) {
            throw ErrorPF2e(
                `Failed to reroll check with a mythic point. Check is missing a proficiency modifier!`
            );
        }
        // Set flag proficiency modifier to mythic modifier value
        const mythicModifierValue = 10 + (pwolVariant ? 0 : actor.level);
        const proficiencyModifierValue = proficiencyModifier.modifier;
        proficiencyModifier.modifier = mythicModifierValue;
        proficiencyModifier.label = game.i18n.localize("PF2E.TraitMythic");
        // Calculate the new total modifier
        const options = foundry.utils.deepClone(oldRoll.options);
        options.totalModifier =
            (options.totalModifier ?? 0) - proficiencyModifierValue + mythicModifierValue;
        const CheckRoll = getCheckRollClass();
        return new CheckRoll(
            `${options.dice}${signedInteger(options.totalModifier, { emptyStringZero: true })}`,
            oldRoll.data,
            options
        );
    })();
    unevaluatedNewRoll.options.isReroll = true;

    Hooks.callAll(
        "pf2e.preReroll",
        Roll.fromJSON(targetSave.roll),
        unevaluatedNewRoll,
        resource,
        keep
    );

    const newRoll = await unevaluatedNewRoll.evaluate({ allowInteractive: !targetSave.private });
    Hooks.callAll("pf2e.reroll", Roll.fromJSON(targetSave.roll), newRoll, resource, keep);

    await roll3dDice(newRoll, target, targetSave.private);

    const keptRoll =
        (keep === "higher" && oldRoll.total > newRoll.total) ||
        (keep === "lower" && oldRoll.total < newRoll.total)
            ? oldRoll
            : newRoll;

    if (keptRoll === newRoll) {
        const success = new DegreeOfSuccess(newRoll, dataSave.dc, targetSave.dosAdjustments);
        keptRoll.options.degreeOfSuccess = success.value;
    }

    const domains = actor.saves?.[dataSave.statistic]?.domains ?? [];
    const outcome = DEGREE_STRINGS[keptRoll.degreeOfSuccess!];

    const notes = R.pipe(
        [...extractNotes(actor.synthetics.rollNotes, domains)],
        R.map((note) => {
            return note instanceof RollNotePF2e ? note : new RollNotePF2e(note);
        }),
        R.filter((note) => {
            const test = note.predicate.test([
                ...data.extraRollOptions,
                ...(note.rule?.item.getRollOptions("parent") ?? []),
            ]);
            return test && (!note.outcome.length || (outcome && note.outcome.includes(outcome)));
        })
    );

    const modifiers = foundry.utils.deepClone(targetSave.modifiers);

    if (result.reroll === "mythic") {
        const proficiencyIdx = modifiers.findIndex((modifier) => modifier.slug === "proficiency");

        const mythic = {
            excluded: false,
            label: game.i18n.localize("PF2E.TraitMythic"),
            modifier: 10 + (pwolVariant ? 0 : actor.level),
            slug: "proficiency",
        };

        if (proficiencyIdx !== -1) {
            const proficiency = modifiers[proficiencyIdx];

            proficiency.excluded = true;
            modifiers.splice(proficiencyIdx + 1, 0, mythic);
        } else {
            modifiers.push(mythic);
        }
    }

    const rollData: SaveRollData = {
        die: (keptRoll.terms[0] as foundry.dice.terms.NumericTerm).total,
        dosAdjustments: foundry.utils.deepClone(targetSave.dosAdjustments),
        modifiers,
        notes: notes.map((note) => note.toObject()),
        private: targetSave.private,
        rerolled: result.reroll,
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
            slug: "keeley-add-10",
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

    this.updateMessageEmitable.call({
        message,
        saves: updates,
        variantId: data.variantId,
    });
}

type SaveRollData = {
    die: number;
    dosAdjustments?: Record<string, { label: string; amount: DegreeAdjustmentAmount }>;
    modifiers: { label: string; modifier: number; slug: string }[];
    notes: RollNoteSource[];
    private: boolean;
    rerolled?: RerollType;
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
export type { RerollSaveHook, RollSaveHook, SaveRollData };
