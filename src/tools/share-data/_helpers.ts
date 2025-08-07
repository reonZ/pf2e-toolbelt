import { AbstractEffectPF2e, ActorPF2e, CreaturePF2e, DurationData, R } from "module-helpers";
import { getMasterInMemory } from ".";

/**
 * https://github.com/foundryvtt/pf2e/blob/f26bfcc353ebd58efd6d1140cdb8e20688acaea8/src/module/item/abstract-effect/values.ts#L2-L7
 */
const DURATION_UNITS: Readonly<Record<string, number>> = {
    rounds: 6,
    minutes: 60,
    hours: 3600,
    days: 86400,
};

/**
 * add master as fightyActor for slaves too
 * https://github.com/foundryvtt/pf2e/blob/f26bfcc353ebd58efd6d1140cdb8e20688acaea8/src/module/item/abstract-effect/helpers.ts#L5
 */
function calculateRemainingDuration(
    effect: AbstractEffectPF2e,
    durationData: DurationData
): { expired: boolean; remaining: number } {
    if (durationData.unit === "encounter") {
        const isExpired = effect.system.expired;
        return { expired: !!isExpired, remaining: isExpired ? 0 : Infinity };
    } else if (durationData.unit === "unlimited" || !effect.system.start) {
        return { expired: false, remaining: Infinity };
    }

    const start = effect.system.start.value;
    const { combatant } = game.combat ?? {};
    const { unit, expiry } = durationData;

    const duration = durationData.value * (DURATION_UNITS[durationData.unit] ?? 0);

    // Prevent effects that expire at end of current turn or round from expiring immediately outside of encounters
    const addend =
        !combatant &&
        duration === 0 &&
        unit === "rounds" &&
        ["turn-end", "round-end"].includes(expiry ?? "")
            ? 1
            : 0;
    const remaining = start + duration + addend - game.time.worldTime;
    const result = { remaining, expired: remaining <= 0 };

    if (remaining === 0 && combatant?.actor) {
        const startInitiative = effect.system.start.initiative ?? 0;
        const currentInitiative = combatant.initiative ?? 0;

        // A familiar won't be represented in the encounter tracker: use the master in its place
        const fightyActor = effect.actor?.isOfType("familiar")
            ? effect.actor.master ?? effect.actor
            : effect.actor;
        const atTurnStart = () =>
            startInitiative === currentInitiative &&
            combatant.actor ===
                (effect.origin ?? getMasterInMemory(fightyActor as CreaturePF2e) ?? fightyActor);

        result.expired =
            expiry === "turn-start"
                ? atTurnStart()
                : expiry === "turn-end"
                ? currentInitiative < startInitiative
                : expiry === "round-end"
                ? remaining <= 0 && game.time.worldTime > start
                : false;
    }

    return result;
}

/**
 * https://github.com/foundryvtt/pf2e/blob/b5cd5c73ee0c956fbb0c1385dd9d89c5026ec682/src/module/actor/helpers.ts#L199
 */
function createEncounterRollOptions(actor: ActorPF2e): Record<string, boolean> {
    const encounter = game.ready ? game.combat : null;
    if (!encounter?.started) return {};

    const participants = encounter.combatants.contents
        .filter((c) => typeof c.initiative === "number")
        .sort((a, b) => b.initiative! - a.initiative!); // Sort descending by initiative roll result
    const participant = actor.combatant;
    if (typeof participant?.initiative !== "number" || !participants.includes(participant)) {
        return {};
    }

    const initiativeRoll = Math.trunc(participant.initiative);
    const initiativeRank = participants.indexOf(participant) + 1;
    const { initiativeStatistic } = participant.flags.pf2e;

    const threat = encounter.metrics?.threat;
    const numericThreat = { trivial: 0, low: 1, moderate: 2, severe: 3, extreme: 4 }[
        threat ?? "trivial"
    ];

    const entries = (
        [
            ["encounter", true],
            [`encounter:threat:${numericThreat}`, !!threat],
            [`encounter:threat:${threat}`, !!threat],
            [`encounter:round:${encounter.round}`, true],
            [`encounter:turn:${Number(encounter.turn) + 1}`, true],
            ["self:participant:own-turn", encounter.combatant === participant],
            [`self:participant:initiative:roll:${initiativeRoll}`, true],
            [`self:participant:initiative:rank:${initiativeRank}`, true],
            [`self:participant:initiative:stat:${initiativeStatistic}`, !!initiativeStatistic],
        ] as const
    ).filter(([, value]) => !!value);

    return Object.fromEntries(entries);
}

/**
 * https://github.com/foundryvtt/pf2e/blob/f26bfcc353ebd58efd6d1140cdb8e20688acaea8/src/module/actor/helpers.ts#L45
 */
async function resetActors(
    actors?: Iterable<ActorPF2e>,
    options: ResetActorsRenderOptions = {}
): Promise<void> {
    actors ??= [
        game.actors.contents,
        game.scenes.contents.flatMap((s) => s.tokens.contents).flatMap((t) => t.actor ?? []),
    ].flat();
    actors = R.unique(Array.from(actors));
    options.sheets ??= true;

    for (const actor of actors) {
        actor.reset();
        if (options.sheets) actor.render();
    }
    game.pf2e.effectPanel.refresh();

    if (options.tokens) {
        for (const token of R.unique(
            Array.from(actors).flatMap((a) => a.getActiveTokens(true, true))
        )) {
            token.simulateUpdate();
        }
    }
}

interface ResetActorsRenderOptions {
    sheets?: boolean;
    tokens?: boolean;
}

export { calculateRemainingDuration, createEncounterRollOptions, resetActors };
