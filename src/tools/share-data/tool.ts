import {
    ActorPF2e,
    ActorSourcePF2e,
    ActorUUID,
    ApplicationV1HeaderButton,
    AppliedDamageFlag,
    CharacterPF2e,
    CharacterSkill,
    CharacterSkillData,
    CharacterSource,
    CombatantPF2e,
    createEmitable,
    CreaturePF2e,
    CreatureSheetPF2e,
    DatabaseDeleteOperation,
    DatabaseUpdateOperation,
    DeferredValueParams,
    EffectPF2e,
    EncounterPF2e,
    EquipmentPF2e,
    executeWhenReady,
    getFirstActiveToken,
    includesAny,
    isPrimaryOwner,
    isPrimaryUpdater,
    isSF2eItem,
    Modifier,
    ModifierType,
    MODULE,
    PerceptionStatistic,
    R,
    registerWrapper,
    Statistic,
    SYSTEM,
    WeaponPF2e,
} from "foundry-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";
import { sharedWeaponPrepareBaseData } from "tools";
import { ShareData, ShareDataConfig, ShareDataSource, ShareDataType, zShareData } from ".";

/**
 * https://github.com/foundryvtt/pf2e/blob/f26bfcc353ebd58efd6d1140cdb8e20688acaea8/src/module/item/abstract-effect/values.ts#L2-L7
 */
const DURATION_UNITS: Readonly<Record<string, number>> = {
    rounds: 6,
    minutes: 60,
    hours: 3600,
    days: 86400,
};

const GRADES = {
    null: { potency: 0, resilient: 0 },
    undefined: { potency: 0, resilient: 0 },
    commercial: { potency: 0, resilient: 0 },
    tactical: { potency: 1, resilient: 0 },
    advanced: { potency: 1, resilient: 1 },
    superior: { potency: 2, resilient: 1 },
    elite: { potency: 2, resilient: 2 },
    ultimate: { potency: 3, resilient: 2 },
    paragon: { potency: 3, resilient: 0 },
};

// they are ordered by armor bonus
const BANDS_OF_FORCE_SLUGS = ["bands-of-force", "bands-of-force-greater", "bands-of-force-major"];

class ShareDataTool extends ModuleTool<ShareDataSettings> {
    #updateMasterEmitable = createEmitable(this.path("master"), this.#updateMaster.bind(this));
    #slaveTurnEmitable = createEmitable(this.path("slave-turn"), this.#slaveTurn.bind(this));
    #slaveInitiativeEmitable = createEmitable(this.path("slave-initiative"), this.#slaveInitiative.bind(this));

    get key(): "shareData" {
        return "shareData";
    }

    get settingsSchema(): ToolSettingsList<ShareDataSettings> {
        return [
            {
                key: "enabled",
                type: Boolean,
                default: false,
                scope: "world",
                requiresReload: true,
            },
        ];
    }

    get api(): toolbelt.Api["shareData"] {
        return {
            getMasterInMemory: this.getMasterInMemory.bind(this),
            getSlavesInMemory: this.getSlavesInMemory.bind(this),
        };
    }

    init(isGM: boolean): void {
        if (!this.settings.enabled) return;

        const registerToolWrapper = (path: string | string[], callback: libWrapper.RegisterCallback) => {
            registerWrapper("WRAPPER", path, callback, this);
        };

        const registerToolOverride = (path: string | string[], callback: libWrapper.RegisterCallback) => {
            registerWrapper("OVERRIDE", path, callback, this);
        };

        const registerCreatureWrapper = (path: string, callback: libWrapper.RegisterCallback) => {
            registerToolWrapper(
                ["character", "npc"].map((type) => `CONFIG.PF2E.Actor.documentClasses.${type}.prototype.${path}`),
                callback,
            );
        };

        registerCreatureWrapper("undoDamage", this.#actorUndoDamage);

        registerCreatureWrapper("prepareBaseData", this.#actorPrepareBaseData);

        registerCreatureWrapper("prepareData", this.#actorPrepareData);

        registerCreatureWrapper("prepareDerivedData", this.#actorPrepareDerivedData);

        registerCreatureWrapper("_preUpdate", this.#actorPreUpdate);

        registerCreatureWrapper("_onUpdate", this.#actorOnUpdate);

        registerCreatureWrapper("_onDelete", this.#actorOnDelete);

        registerToolWrapper("CONFIG.Combatant.documentClass.prototype.startTurn", this.#combatantStartTurn);

        registerToolWrapper("CONFIG.Combatant.documentClass.prototype.endTurn", this.#combatantEndTurn);

        registerToolWrapper("CONFIG.Combatant.documentClass.prototype._onUpdate", this.#combatantOnUpdate);

        registerToolOverride("CONFIG.Combat.documentClass.prototype.resetActors", this.#combatResetActors);

        // we only have effect here despite the accessor being on AbstractEffectPF2e
        // because the system only ever use it for effects
        registerToolOverride(
            "CONFIG.PF2E.Item.documentClasses.effect.prototype.remainingDuration",
            this.#effectRemainingDuration,
        );

        // we do not activate this wrapper because afflictions aren't offcially in the system yet
        // registerToolOverride(
        //     "CONFIG.PF2E.Item.documentClasses.affliction.prototype.remainingStageDuration",
        //     this.#afflictionRemainingStageDuration
        // );

        sharedWeaponPrepareBaseData.register(this.#weaponPrepareBaseData, { context: this, priority: 100 }).activate();

        if (!isGM) return;

        this.#updateMasterEmitable.activate();
        this.#slaveTurnEmitable.activate();

        Hooks.on("getCreatureSheetPF2eHeaderButtons", this.#onGetCreatureSheetPF2eHeaderButtons.bind(this));
    }

    getShareDataInMemory(actor: CreaturePF2e): ShareData | undefined {
        return this.getInMemory(actor, "data");
    }

    getShareData(actor: CreaturePF2e): ShareData {
        const rawFlag = this.getFlag<ShareDataSource>(actor, "data");
        const flag = R.isObjectType(rawFlag) ? foundry.utils.deepClone(rawFlag) : {};
        return zShareData.parse(flag);
    }

    getMasterId(actor: CreaturePF2e): string | undefined {
        return this.getFlag(actor, "data.master");
    }

    isValidActor(actor: unknown): actor is CreaturePF2e {
        return (
            !!actor &&
            actor instanceof Actor &&
            !actor.pack &&
            game.actors.has(actor.id) &&
            (actor as ActorPF2e).isOfType("character", "npc")
        );
    }

    isValidMaster(actor: unknown, id?: string): actor is CreaturePF2e<null> {
        if (!this.isValidActor(actor) || (id && actor.id === id) || this.getMasterInMemory(actor)) return false;

        const masterId = this.getMasterId(actor);
        return !masterId || !game.actors.get(masterId);
    }

    isValidSlave(actor: unknown): actor is CreaturePF2e<null> {
        return this.isValidActor(actor) && !this.getInMemory(actor, "slaves");
    }

    getMasterInMemory(actor: CreaturePF2e): CreaturePF2e | undefined {
        return this.getInMemory<CreaturePF2e | undefined>(actor, "data.master");
    }

    getSlavesInMemory(actor: CreaturePF2e, idOnly: false): CreaturePF2e[];
    getSlavesInMemory(actor: CreaturePF2e, idOnly?: true): Set<ActorUUID> | undefined;
    getSlavesInMemory(actor: CreaturePF2e, idOnly: boolean = true) {
        const uuids = this.getInMemory<Set<ActorUUID>>(actor, "slaves");
        if (idOnly) return uuids;

        const slaves: CreaturePF2e[] = [];

        for (const uuid of uuids ?? []) {
            const slave = fromUuidSync<CreaturePF2e>(uuid);

            if (this.isValidSlave(slave)) {
                slaves.push(slave);
            }
        }

        return slaves;
    }

    // afflictions aren't offcially in the system yet
    // #afflictionRemainingStageDuration(item: AfflictionPF2e): {
    //     expired: boolean;
    //     remaining: number;
    // } {
    //     const stageData = item.system.stages.at(item.stage - 1);
    //     const stageDuration: DurationData = {
    //         ...(stageData?.duration ?? { unit: "unlimited", value: -1 }),
    //         expiry: "turn-end",
    //     };
    //     return calculateRemainingDuration(item, stageDuration);
    // }

    /**
     * add master as fightyActor for slaves too
     * https://github.com/foundryvtt/pf2e/blob/f26bfcc353ebd58efd6d1140cdb8e20688acaea8/src/module/item/abstract-effect/helpers.ts#L5
     */
    #effectRemainingDuration(effect: EffectPF2e): { expired: boolean; remaining: number } {
        const durationData = effect.system.duration;

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
            !combatant && duration === 0 && unit === "rounds" && ["turn-end", "round-end"].includes(expiry ?? "")
                ? 1
                : 0;
        const remaining = start + duration + addend - game.time.worldTime;
        const result = { remaining, expired: remaining <= 0 };

        if (remaining === 0 && combatant?.actor) {
            const startInitiative = effect.system.start.initiative ?? 0;
            const currentInitiative = combatant.initiative ?? 0;

            // A familiar won't be represented in the encounter tracker: use the master in its place
            const fightyActor = effect.actor?.isOfType("familiar")
                ? (effect.actor.master ?? effect.actor)
                : effect.actor;

            // this part is heavily modified
            const atTurnStart = () => {
                if (startInitiative !== currentInitiative) return false;

                const master = effect.actor?.combatant ? null : this.getMasterInMemory(fightyActor as CreaturePF2e);

                const origin = (effect.origin === effect.actor && master) || effect.origin;

                return combatant.actor === (origin ?? master ?? fightyActor);
            };

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

    // this is a shared wrapper listener
    #weaponPrepareBaseData(weapon: WeaponPF2e) {
        const actor = weapon.actor;
        if (!actor?.isOfType("character")) return;

        const master = this.#getMasterIfOption(actor, "weaponRunes");
        if (!master?.isOfType("character")) return;

        const masterWeapon = R.pipe(
            master.itemTypes.weapon,
            R.filter((item) => !!item.isInvested && !!item.system.runes.potency),
            R.sortBy(
                [(item) => item.system.runes.potency, "desc"],
                [(item) => item.system.runes.striking, "desc"],
                [(item) => item.system.runes.property.length, "desc"],
            ),
            R.first(),
        );

        if (masterWeapon) {
            weapon.system.runes.potency = masterWeapon.system.runes.potency;
            weapon.system.runes.striking = masterWeapon.system.runes.striking;
            weapon.system.runes.property = masterWeapon.system.runes.property.slice();
        }
    }

    /**
     * upgraded version of
     * https://github.com/foundryvtt/pf2e/blob/f26bfcc353ebd58efd6d1140cdb8e20688acaea8/src/module/encounter/document.ts#L230
     */
    #combatResetActors(encounter: EncounterPF2e) {
        const actors: ActorPF2e[] = R.unique(
            encounter.combatants.contents
                .flatMap((combatant) => {
                    const actor = combatant.actor;

                    if (!actor?.isOfType("character")) {
                        return [actor];
                    }

                    // we add slaves and their familiars
                    const extras = R.pipe(
                        this.getSlavesInMemory(actor, false),
                        R.flatMap((slave) => {
                            if (this.#isInvalidNonCombatantSlave(slave)) return null;
                            return [slave, slave.isOfType("character") ? slave.familiar : null];
                        }),
                    );

                    return [actor, actor.familiar, ...extras];
                })
                .filter(R.isNonNull),
        );
        this.#resetActors(actors, { sheets: false, tokens: true });
    }

    /**
     * https://github.com/foundryvtt/pf2e/blob/f26bfcc353ebd58efd6d1140cdb8e20688acaea8/src/module/actor/helpers.ts#L45
     */
    async #resetActors(actors?: Iterable<ActorPF2e>, options: ResetActorsRenderOptions = {}): Promise<void> {
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
            for (const token of R.unique(Array.from(actors).flatMap((a) => a.getActiveTokens(true, true)))) {
                token.simulateUpdate();
            }
        }
    }

    #combatantOnUpdate(
        combatant: CombatantPF2e,
        wrapped: libWrapper.RegisterCallback,
        changed: DeepPartial<Combatant["_source"]>,
        operation: DatabaseUpdateOperation<EncounterPF2e>,
        userId: string,
    ) {
        wrapped(changed, operation, userId);

        if (typeof changed.initiative !== "number" || userId !== game.user.id) return;

        const actor = combatant.actor;
        if (!actor?.isOfType("character", "npc")) return;

        const slaves = this.getSlavesInMemory(actor, false);
        if (!slaves.length) return;

        Promise.resolve().then(async () => {
            for (const slave of slaves) {
                if (isPrimaryOwner(slave)) {
                    this.#slaveInitiative({ slave });
                } else {
                    this.#slaveInitiativeEmitable.emit({ slave });
                }
            }
        });
    }

    /**
     * repurposed version of
     * https://github.com/foundryvtt/pf2e/blob/f26bfcc353ebd58efd6d1140cdb8e20688acaea8/src/module/encounter/combatant.ts#L265
     */
    #slaveInitiative({ slave }: SlaveIntiativeOptions) {
        if (this.#isInvalidNonCombatantSlave(slave)) return;

        const eventType = "initiative-roll";
        this.#performActorUpdates(slave, eventType).then(() => {
            for (const effect of slave.itemTypes.effect ?? []) {
                effect.onEncounterEvent(eventType);
            }
        });
    }

    async #combatantEndTurn(
        combatant: CombatantPF2e,
        wrapped: libWrapper.RegisterCallback,
        options: { round: number },
    ) {
        await wrapped(options);
        await this.#combatantTurn("turn-end", combatant);
    }

    async #combatantStartTurn(combatant: CombatantPF2e, wrapped: libWrapper.RegisterCallback) {
        await wrapped();
        await this.#combatantTurn("turn-start", combatant);
    }

    async #combatantTurn(eventType: "turn-end" | "turn-start", combatant: CombatantPF2e) {
        const { actor, encounter } = combatant;
        if (!encounter || !actor?.isOfType("character", "npc")) return;

        const slaves = this.getSlavesInMemory(actor, false);
        for (const slave of slaves) {
            if (isPrimaryOwner(slave)) {
                await this.#slaveTurn({ encounter, eventType, slave });
            } else {
                this.#slaveTurnEmitable.emit({ encounter, eventType, slave });
            }
        }
    }

    /**
     * repurposed version of combined
     * https://github.com/reonZ/pf2e-toolbelt/blob/83e091bdd46cc87c8b872cf11028a95a77bd3ad8/src/tools/share.ts#L228
     * https://github.com/reonZ/pf2e-toolbelt/blob/83e091bdd46cc87c8b872cf11028a95a77bd3ad8/src/tools/share.ts#L267
     */
    async #slaveTurn({ encounter, eventType, slave }: SlaveTurnOptions) {
        if (this.#isInvalidNonCombatantSlave(slave)) return;

        const slaveCombatant = this.#createCombatant(slave, encounter);

        if (eventType === "turn-end") {
            // Run condition end of turn effects, unless the actor is dead
            if (!slave.isDead) {
                const activeConditions = slave.conditions.active;
                for (const condition of activeConditions) {
                    await condition.onEndTurn({ token: slaveCombatant.token });
                }
            }
        } else if (eventType === "turn-start") {
            // Run any turn start events before the effect tracker updates
            await this.#performActorUpdates(slave, eventType);
        }

        // Effect changes on turn start/end
        for (const effect of slave.itemTypes.effect) {
            await effect.onEncounterEvent(eventType);
        }
        if (slave.isOfType("character") && slave.familiar) {
            for (const effect of slave.familiar.itemTypes.effect) {
                await effect.onEncounterEvent(eventType);
            }
        }

        const hookEvent = eventType === "turn-end" ? "pf2e.endTurn" : "pf2e.startTurn";
        Hooks.callAll(hookEvent, slaveCombatant, encounter, game.user.id);
    }

    /**
     * https://github.com/foundryvtt/pf2e/blob/f26bfcc353ebd58efd6d1140cdb8e20688acaea8/src/module/encounter/combatant.ts#L233
     */
    async #performActorUpdates(actor: CreaturePF2e, event: "initiative-roll" | "turn-start"): Promise<void> {
        const actorUpdates: Record<string, unknown> = {};
        for (const rule of actor.rules ?? []) {
            await rule.onUpdateEncounter?.({ event, actorUpdates });
        }
        await actor.update(actorUpdates);

        // Refresh usages of any abilities with round durations
        if (event === "turn-start") {
            await actor.recharge({ duration: "round" });
        }
    }

    #updateMaster({ master, ...updates }: UpdateMasterOptions) {
        if (!this.isValidMaster(master)) return;
        master.update(updates);
    }

    // we can't actually revert damage from a slave because of the diff, so we just cancel the hp update and warn the user
    async #actorUndoDamage(
        actor: CreaturePF2e,
        wrapped: libWrapper.RegisterCallback,
        appliedDamage: AppliedDamageFlag,
    ): Promise<void> {
        const master = this.#getMasterIfOption(actor, "health");

        if (master) {
            const hpUpdate = appliedDamage.updates.findSplice((update) => update.path === "system.attributes.hp.value");

            const spUpdates = appliedDamage.updates.findSplice(
                (update) => update.path === "system.attributes.hp.sp.value",
            );

            if (hpUpdate || spUpdates) {
                await wrapped(appliedDamage);

                const ChatMessageCls = getDocumentClass("ChatMessage");

                const icon = `<i class="fa-solid fa-triangle-exclamation"></i>`;
                const msg = this.localize("undo.msg");

                ChatMessageCls.create({
                    content: `${icon} <i>${msg}</i>`,
                    speaker: ChatMessageCls.getSpeaker({ actor }),
                });

                return;
            }
        }

        return wrapped(appliedDamage);
    }

    async #actorPreUpdate(
        actor: CreaturePF2e,
        wrapped: libWrapper.RegisterCallback,
        changes: DeepPartial<CharacterSource>,
        operation: CreatureDatabaseUpdateOperation,
        userId: string,
    ): Promise<boolean | void> {
        const flag = changes.flags?.[MODULE.id]?.[this.key] as Maybe<{
            "==data"?: ShareDataSource;
            data?: ShareDataSource;
        }>;

        const newData = flag ? (flag["==data"] ?? flag["data"]) : undefined;
        const newMasterId = newData?.master;

        if (newMasterId !== undefined) {
            const previousMaster = this.getMasterInMemory(actor);

            if (previousMaster && previousMaster.id !== newMasterId) {
                operation.previousShareMasterId = previousMaster.id;
            }
        }

        const masterId = newMasterId ?? this.getMasterId(actor);
        const master = masterId ? game.actors.get(masterId) : undefined;
        if (this.isValidMaster(master)) {
            const updateKeys: UpdateMasterPath[] = [];

            if (newData?.health ?? this.#getShareOptionInMemory(actor, "health")) {
                updateKeys.push(
                    "system.attributes.hp.value",
                    "system.attributes.hp.sp.value",
                    "system.attributes.hp.temp",
                );
            }

            if (newData?.heroPoints ?? this.#getShareOptionInMemory(actor, "heroPoints")) {
                updateKeys.push("system.resources.heroPoints.value");
            }

            if (newData?.spellcasting ?? this.#getShareOptionInMemory(actor, "spellcasting")) {
                updateKeys.push("system.resources.focus.value");
            }

            const masterUpdates: [UpdateMasterPath, any][] = R.pipe(
                updateKeys,
                R.map((path): [UpdateMasterPath, any] | undefined => {
                    const value = foundry.utils.getProperty(changes, path);
                    if (value === undefined) return;

                    foundry.utils.deleteProperty(changes, path);
                    return [path, value];
                }),
                R.filter(R.isDefined),
            );

            if (masterUpdates.length) {
                const updates = R.fromEntries(masterUpdates) as Record<UpdateMasterPath, any>;

                if (master.isOwner) {
                    master.update(updates);
                } else {
                    this.#updateMasterEmitable.emit({ master: master, ...updates });
                }
            }
        }

        return wrapped(changes, operation, userId);
    }

    #actorOnDelete(
        actor: CreaturePF2e,
        wrapped: libWrapper.RegisterCallback,
        operation: DatabaseDeleteOperation<null>,
        userId: string,
    ) {
        const master = this.getMasterInMemory(actor);
        const slaves = this.getSlavesInMemory(actor, false);
        const actorId = actor.id;
        const toRemove: string[] = [];

        if (master) {
            this.#removeSlaveFromMemory(master, actor);
        }

        for (const slave of slaves) {
            // this user should unset the flag of all the slaves they are primary updater of
            if (this.getMasterId(slave) === actorId && isPrimaryUpdater(slave)) {
                toRemove.push(slave.id);
            }

            this.deleteInMemory(slave, "data");
        }

        if (toRemove.length) {
            const updates = toRemove.map((slaveId) => {
                return this.unsetFlagProperty({ _id: slaveId }, "data");
            });

            getDocumentClass("Actor").updateDocuments(updates);
        }

        wrapped(operation, userId);
    }

    async #actorOnUpdate(
        actor: CreaturePF2e,
        wrapped: libWrapper.RegisterCallback,
        changes: DeepPartial<ActorSourcePF2e>,
        operation: CreatureDatabaseUpdateOperation,
        userId: string,
    ): Promise<boolean | void> {
        if (operation.previousShareMasterId) {
            const previousMaster = game.actors.get<CreaturePF2e<null>>(operation.previousShareMasterId);

            if (previousMaster) {
                this.#removeSlaveFromMemory(previousMaster, actor);
            }
        }

        return wrapped(changes, operation, userId);
    }

    #actorPrepareData(actor: CreaturePF2e, wrapped: libWrapper.RegisterCallback) {
        wrapped();

        // this one is to avoid race condition with masters created later in the world
        executeWhenReady(() => {
            // a master forces all slaves to refresh
            const slaves = this.getSlavesInMemory(actor, false);
            if (slaves.length) {
                for (const slave of slaves) {
                    slave.reset();
                    slave.sheet.render();

                    for (const token of slave.getActiveTokens()) {
                        token.renderFlags.set({ refreshBars: true });
                    }
                }

                return;
            }

            // a slave copies its master's stats
            const data = this.getShareDataInMemory(actor);
            const master = data?.master;
            if (!master) return;

            if (data.health) {
                actor.system.attributes.hp = foundry.utils.mergeObject(
                    new game.pf2e.StatisticModifier("hp"),
                    master.system.attributes.hp,
                );
            }

            if (data.languages) {
                actor.system.details.languages.value = R.pipe(
                    actor.system.details.languages.value,
                    R.concat(master.system.details.languages.value),
                    R.unique(),
                );
                // we can't do that because the system fills the details field with the prepared data instead of the source
                // actor.system.details.languages.details = [
                //     actor.system.details.languages.details,
                //     master.system.details.languages.details,
                // ].join("; ");
            }

            // the following is only for characters
            if (!master.isOfType("character") || !actor.isOfType("character")) return;

            if (data.heroPoints) {
                actor.system.resources.heroPoints = foundry.utils.deepClone(master.system.resources.heroPoints);
            }

            if (data.spellcasting) {
                actor.system.resources.focus = foundry.utils.deepClone(master.system.resources.focus);
            }

            if (data.skills) {
                const masterPerception = master.perception;
                const slavePerception = actor.perception;

                // we add the master's item modifiers to perception
                if (masterPerception && slavePerception) {
                    const PerceptionCls = slavePerception.constructor as typeof PerceptionStatistic;
                    const modifiers = R.pipe(
                        masterPerception.check.modifiers,
                        R.filter((modifier) => modifier.type === "item"),
                        R.map((modifier) => modifier.clone()),
                    );

                    const perception = new PerceptionCls(actor, {
                        slug: "perception",
                        label: "PF2E.PerceptionLabel",
                        attribute: "wis",
                        rank: actor.system.perception.rank,
                        domains: ["perception", "all"],
                        check: { type: "perception-check", modifiers },
                        senses: actor.system.perception.senses,
                    });

                    actor.perception = perception;
                    actor.system.perception = foundry.utils.mergeObject(perception.getTraceData(), {
                        attribute: perception.attribute ?? "wis",
                        rank: actor.system.perception.rank,
                    });
                }

                const Statistic = getStatisticCls(actor);

                for (const [slug, skill] of R.entries(CONFIG.PF2E.skills)) {
                    const { check, domains, rank } = master.skills[slug];
                    const currentRank = actor.skills[slug].rank;
                    const attribute = skill.attribute;
                    const actualRank = Math.max(rank, currentRank);

                    // we add item modifiers from master
                    const modifiers = R.pipe(
                        check.modifiers,
                        R.filter((modifier) => modifier.type === "item"),
                        R.map((modifier) => modifier.clone()),
                    );

                    const statistic = new Statistic(actor, {
                        slug,
                        label: skill.label,
                        attribute,
                        domains,
                        modifiers: [],
                        lore: false,
                        rank: actualRank,
                        check: { type: check.type, modifiers },
                    });

                    actor.skills[slug] = statistic;
                    actor.system.skills[slug] = foundry.utils.mergeObject(
                        statistic.getTraceData() as CharacterSkillData,
                        { attribute, rank: actualRank },
                    );
                }
            }
        });
    }

    #actorPrepareBaseData(actor: CreaturePF2e, wrapped: libWrapper.RegisterCallback) {
        wrapped();

        // we are a master, we skip
        if (this.getSlavesInMemory(actor)?.size) return;

        const data = this.getShareData(actor);
        const master = data.master;

        if (!master) {
            this.deleteInMemory(actor, "data");
            return;
        }

        this.setInMemory(actor, "data", data);

        if (data.timeEvents) {
            actor.flags[SYSTEM.id].rollOptions.all = foundry.utils.mergeObject(
                actor.flags[SYSTEM.id].rollOptions.all,
                this.#createEncounterRollOptions(master),
            );
        }

        const slaves = this.getSlavesInMemory(master);

        if (!slaves) {
            this.setInMemory(master, "slaves", new Set([actor.uuid]));
        } else {
            slaves.add(actor.uuid);
        }
    }

    /**
     * https://github.com/foundryvtt/pf2e/blob/b5cd5c73ee0c956fbb0c1385dd9d89c5026ec682/src/module/actor/helpers.ts#L199
     */
    #createEncounterRollOptions(actor: ActorPF2e): Record<string, boolean> {
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
        const { initiativeStatistic } = participant.flags[SYSTEM.id];
        const threat = encounter.metrics?.threat;
        const numericThreat = { trivial: 0, low: 1, moderate: 2, severe: 3, extreme: 4 }[threat ?? "trivial"];

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

    #actorPrepareDerivedData(actor: CreaturePF2e, wrapped: libWrapper.RegisterCallback) {
        if (!game.ready) {
            return wrapped();
        }

        const data = this.getShareDataInMemory(actor);
        const master = data?.master;

        if (!data || !master?.isOfType("character")) {
            return wrapped();
        }

        if (data.armorRunes) {
            const wornArmor = master.wornArmor;
            const wornArmorIsSF2e = !!wornArmor && isSF2eItem(wornArmor);
            const armor = (wornArmorIsSF2e ? wornArmor.isEquipped : wornArmor?.isInvested) ? wornArmor : undefined;
            const bracers = R.pipe(
                master.itemTypes.equipment,
                R.filter((item): item is EquipmentPF2e<CharacterPF2e> & { slug: string } => {
                    return BANDS_OF_FORCE_SLUGS.includes(item.slug as any) && !!item.isInvested;
                }),
                R.sortBy([(item) => item.slug, "desc"]),
                R.first(),
            );

            const bracerBonus = (bracers ? BANDS_OF_FORCE_SLUGS.indexOf(bracers.slug) : -1) + 1;

            if (armor || bracerBonus) {
                for (const selector of ["ac", "saving-throw"] as const) {
                    const runeType = selector === "ac" ? "potency" : "resilient";
                    const armorBonus = wornArmorIsSF2e
                        ? GRADES[armor?.system.grade as keyof typeof GRADES]?.[runeType]
                        : armor?.system.runes[runeType];

                    const armorValue = armorBonus ?? 0;
                    if (!armorValue && !bracerBonus) continue;

                    const construct = (options: DeferredValueParams = {}): Modifier | null => {
                        const label = armorValue > bracerBonus ? armor!.name : bracers!.name;
                        const slug = SYSTEM.sluggify(label);

                        const modifierType: ModifierType =
                            selector === "saving-throw"
                                ? "item"
                                : includesAny(actor.system.traits.value, ["eidolon", "eldamon"])
                                  ? "potency"
                                  : "item";

                        const modifier = new game.pf2e.Modifier({
                            slug,
                            label,
                            modifier: Math.max(armorValue, bracerBonus),
                            type: modifierType,
                        });

                        if (options.test) {
                            modifier.test(options.test);
                        }

                        return modifier;
                    };

                    const modifiers = (actor.synthetics.modifiers[selector] ??= []);
                    modifiers.push(construct);
                }
            }
        }

        wrapped();

        if (data.spellcasting) {
            Object.defineProperty(actor.spellcasting, "base", {
                get(): Statistic {
                    return master.spellcasting.base;
                },
                enumerable: true,
            });
        }
    }

    #onGetCreatureSheetPF2eHeaderButtons(sheet: CreatureSheetPF2e<CreaturePF2e>, buttons: ApplicationV1HeaderButton[]) {
        const actor = sheet.actor;
        if (!this.isValidSlave(actor)) return;

        buttons.unshift({
            class: "share-data",
            icon: "fa-solid fa-share-all",
            label: this.localize.path("share"),
            onclick: () => {
                new ShareDataConfig(actor, this).render(true);
            },
        });
    }

    #getShareOptionInMemory(actor: CreaturePF2e, option: ShareDataType): boolean {
        return !!this.getShareDataInMemory(actor)?.[option];
    }

    #getMasterIfOption(actor: CreaturePF2e, option: ShareDataType): CreaturePF2e | null {
        const data = this.getShareDataInMemory(actor);
        return data?.[option] ? data.master : null;
    }

    #createCombatant(actor: CreaturePF2e, encounter: EncounterPF2e) {
        const scene = encounter.scene;
        const token = getFirstActiveToken(actor, { scene });
        const CombatantPF2e = getDocumentClass("Combatant");

        return new CombatantPF2e(
            { tokenId: token?.id, actorId: actor.id, hidden: false, sceneId: scene?.id },
            { parent: encounter },
        );
    }

    #isInvalidNonCombatantSlave(slave: CreaturePF2e): boolean {
        return slave.inCombat || !this.#getShareOptionInMemory(slave, "timeEvents");
    }

    #removeSlaveFromMemory(master: CreaturePF2e, slave: CreaturePF2e) {
        const slaves = this.getSlavesInMemory(master);
        slaves?.delete(slave.uuid);
    }
}

const shareDataTool = new ShareDataTool();

function getStatisticCls(actor: CreaturePF2e) {
    return actor.skills.acrobatics.constructor as ConstructorOf<CharacterSkill<CharacterPF2e>>;
}

type ShareDataSettings = {
    enabled: boolean;
};

type CreatureDatabaseUpdateOperation = DatabaseUpdateOperation<CreaturePF2e> & {
    previousShareMasterId?: string;
    masterUpdate?: {
        health?: number;
        heroPoints?: number;
    };
};

type SlaveTurnOptions = {
    eventType: "turn-end" | "turn-start";
    encounter: EncounterPF2e;
    slave: CreaturePF2e;
};

type SlaveIntiativeOptions = {
    slave: CreaturePF2e;
};

type UpdateMasterOptions = {
    master: CreaturePF2e;
    "system.attributes.hp.value"?: number;
    "system.attributes.hp.sp.value"?: number;
    "system.attributes.hp.temp"?: number;
    "system.resources.heroPoints.value"?: number;
    "system.resources.focus.value"?: number;
};

type UpdateMasterPath = Exclude<keyof UpdateMasterOptions, "master">;

interface ResetActorsRenderOptions {
    sheets?: boolean;
    tokens?: boolean;
}

export { shareDataTool };
export type { ShareDataTool };
