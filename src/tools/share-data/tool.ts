import {
    ActorPF2e,
    ActorSourcePF2e,
    CharacterPF2e,
    CharacterSkill,
    CharacterSkillData,
    CharacterSource,
    CombatantPF2e,
    createEmitable,
    CreaturePF2e,
    CreatureSheetPF2e,
    DeferredValueParams,
    EffectPF2e,
    EncounterPF2e,
    EquipmentPF2e,
    getFirstActiveToken,
    includesAny,
    isPrimaryOwner,
    isPrimaryUpdater,
    ModifierPF2e,
    ModifierType,
    MODULE,
    R,
    registerWrapper,
    WeaponPF2e,
} from "module-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";
import { sharedWeaponPrepareBaseData } from "tools/_shared";
import {
    calculateRemainingDuration,
    createEncounterRollOptions,
    getMasterId,
    getMasterInMemory,
    getShareDataInMemory,
    getSlavesInMemory,
    isValidMaster,
    isValidSlave,
    resetActors,
    ShareDataConfig,
    ShareDataModel,
    ShareDataSource,
    ShareDataType,
} from ".";

// they are ordered by armor bonus
const BANDS_OF_FORCE_SLUGS = ["bands-of-force", "bands-of-force-greater", "bands-of-force-major"];

class ShareDataTool extends ModuleTool<ShareDataSettings> {
    #updateMasterEmitable = createEmitable(
        this.localizeKey("master"),
        this.#updateMaster.bind(this)
    );

    #slaveTurnEmitable = createEmitable(this.localizeKey("slave-turn"), this.#slaveTurn.bind(this));

    #slaveInitiativeEmitable = createEmitable(
        this.localizeKey("slave-initiative"),
        this.#slaveInitiative.bind(this)
    );

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

    init(isGM: boolean): void {
        if (!this.settings.enabled) return;

        const registerToolWrapper = (
            path: string | string[],
            callback: libWrapper.RegisterCallback
        ) => {
            registerWrapper("WRAPPER", path, callback, this);
        };

        const registerToolOverride = (
            path: string | string[],
            callback: libWrapper.RegisterCallback
        ) => {
            registerWrapper("OVERRIDE", path, callback, this);
        };

        const registerCreatureWrapper = (path: string, callback: libWrapper.RegisterCallback) => {
            registerToolWrapper(
                ["character", "npc"].map((type) => path.replace("{type}", type)),
                callback
            );
        };

        registerCreatureWrapper(
            "CONFIG.PF2E.Actor.documentClasses.{type}.prototype.prepareBaseData",
            this.#actorPrepareBaseData
        );

        registerCreatureWrapper(
            "CONFIG.PF2E.Actor.documentClasses.{type}.prototype.prepareData",
            this.#actorPrepareData
        );

        registerCreatureWrapper(
            "CONFIG.PF2E.Actor.documentClasses.{type}.prototype.prepareDerivedData",
            this.#actorPrepareDerivedData
        );

        registerCreatureWrapper(
            "CONFIG.PF2E.Actor.documentClasses.{type}.prototype._preUpdate",
            this.#actorPreUpdate
        );

        registerCreatureWrapper(
            "CONFIG.PF2E.Actor.documentClasses.{type}.prototype._onUpdate",
            this.#actorOnUpdate
        );

        registerCreatureWrapper(
            "CONFIG.PF2E.Actor.documentClasses.{type}.prototype._onDelete",
            this.#actorOnDelete
        );

        registerToolWrapper(
            "CONFIG.Combatant.documentClass.prototype.startTurn",
            this.#combatantStartTurn
        );

        registerToolWrapper(
            "CONFIG.Combatant.documentClass.prototype.endTurn",
            this.#combatantEndTurn
        );

        registerToolWrapper(
            "CONFIG.Combatant.documentClass.prototype._onUpdate",
            this.#combatantOnUpdate
        );

        registerToolOverride(
            "CONFIG.Combat.documentClass.prototype.resetActors",
            this.#combatResetActors
        );

        // we only have effect here despite the accessor being on AbstractEffectPF2e
        // because the system only ever use it for effects
        registerToolOverride(
            "CONFIG.PF2E.Item.documentClasses.effect.prototype.remainingDuration",
            this.#effectRemainingDuration
        );

        // we do not activate this wrapper because afflictions aren't offcially in the system yet
        // registerToolOverride(
        //     "CONFIG.PF2E.Item.documentClasses.affliction.prototype.remainingStageDuration",
        //     this.#afflictionRemainingStageDuration
        // );

        sharedWeaponPrepareBaseData
            .register(this.#weaponPrepareBaseData, { context: this, priority: 100 })
            .activate();

        if (!isGM) return;

        this.#updateMasterEmitable.activate();
        this.#slaveTurnEmitable.activate();

        Hooks.on(
            "getCreatureSheetPF2eHeaderButtons",
            this.#onGetCreatureSheetPF2eHeaderButtons.bind(this)
        );
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

    #effectRemainingDuration(item: EffectPF2e): { expired: boolean; remaining: number } {
        return calculateRemainingDuration(item, item.system.duration);
    }

    // this is a shared wrapper listener
    #weaponPrepareBaseData(weapon: WeaponPF2e) {
        const actor = weapon.actor;
        if (!actor?.isOfType("character")) return;

        const master = getMasterIfOption(actor, "weaponRunes");
        if (!master?.isOfType("character")) return;

        const masterWeapon = R.pipe(
            master.itemTypes.weapon,
            R.filter((item) => !!item.isInvested && !!item.system.runes.potency),
            R.sortBy(
                [(item) => item.system.runes.potency, "desc"],
                [(item) => item.system.runes.striking, "desc"],
                [(item) => item.system.runes.property.length, "desc"]
            ),
            R.first()
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
                        getSlavesInMemory(actor, false),
                        R.flatMap((slave) => {
                            if (isInvalidNonCombatantSlave(slave)) return null;
                            return [slave, slave.isOfType("character") ? slave.familiar : null];
                        })
                    );

                    return [actor, actor.familiar, ...extras];
                })
                .filter(R.isNonNull)
        );
        resetActors(actors, { sheets: false, tokens: true });
    }

    #combatantOnUpdate(
        combatant: CombatantPF2e,
        wrapped: libWrapper.RegisterCallback,
        changed: DeepPartial<Combatant["_source"]>,
        operation: DatabaseUpdateOperation<EncounterPF2e>,
        userId: string
    ) {
        wrapped(changed, operation, userId);

        if (typeof changed.initiative !== "number" || userId !== game.user.id) return;

        const actor = combatant.actor;
        if (!actor?.isOfType("character", "npc")) return;

        const slaves = getSlavesInMemory(actor, false);
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
        if (isInvalidNonCombatantSlave(slave)) return;

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
        options: { round: number }
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

        const slaves = getSlavesInMemory(actor, false);
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
        if (isInvalidNonCombatantSlave(slave)) return;

        const slaveCombatant = createCombatant(slave, encounter);

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
    async #performActorUpdates(
        actor: CreaturePF2e,
        event: "initiative-roll" | "turn-start"
    ): Promise<void> {
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
        if (!isValidMaster(master)) return;
        master.update(updates);
    }

    async #actorPreUpdate(
        actor: CreaturePF2e,
        wrapped: libWrapper.RegisterCallback,
        changes: DeepPartial<CharacterSource>,
        operation: CreatureDatabaseUpdateOperation,
        userId: string
    ): Promise<boolean | void> {
        const flag = changes.flags?.[MODULE.id]?.[this.key] as Maybe<{
            "==data"?: ShareDataSource;
            data?: ShareDataSource;
        }>;

        const newData = flag ? flag["==data"] ?? flag["data"] : undefined;
        const newMasterId = newData?.master;

        if (newMasterId !== undefined) {
            const previousMaster = getMasterInMemory(actor);

            if (previousMaster && previousMaster.id !== newMasterId) {
                operation.previousShareMasterId = previousMaster.id;
            }
        }

        const masterId = newMasterId ?? getMasterId(actor);
        const master = masterId ? game.actors.get(masterId) : undefined;
        if (isValidMaster(master)) {
            const updateKeys: UpdateMasterPath[] = [];

            if (newData?.health ?? getShareOptionInMemory(actor, "health")) {
                updateKeys.push(
                    "system.attributes.hp.value",
                    "system.attributes.hp.sp.value",
                    "system.attributes.hp.temp"
                );
            }

            if (newData?.heroPoints ?? getShareOptionInMemory(actor, "heroPoints")) {
                updateKeys.push("system.resources.heroPoints.value");
            }

            if (newData?.spellcasting ?? getShareOptionInMemory(actor, "spellcasting")) {
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
                R.filter(R.isDefined)
            );

            if (masterUpdates.length) {
                const updates: Record<UpdateMasterPath, any> = R.mapToObj(
                    masterUpdates,
                    ([path, value]) => [path, value] as const
                );

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
        userId: string
    ) {
        const master = getMasterInMemory(actor);
        const slaves = getSlavesInMemory(actor, false);
        const actorId = actor.id;
        const toRemove: string[] = [];

        if (master) {
            removeSlaveFromMemory(master, actor);
        }

        for (const slave of slaves) {
            // this user should unset the flag of all the slaves they are primary updater of
            if (getMasterId(slave) === actorId && isPrimaryUpdater(slave)) {
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
        userId: string
    ): Promise<boolean | void> {
        if (operation.previousShareMasterId) {
            const previousMaster = game.actors.get<CreaturePF2e<null>>(
                operation.previousShareMasterId
            );

            if (previousMaster) {
                removeSlaveFromMemory(previousMaster, actor);
            }
        }

        return wrapped(changes, operation, userId);
    }

    #actorPrepareData(actor: CreaturePF2e, wrapped: libWrapper.RegisterCallback) {
        wrapped();

        if (!game.ready) return;

        // a master forces all slaves to refresh
        const slaves = getSlavesInMemory(actor, false);
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
        const data = getShareDataInMemory(actor);
        const master = data?.master;
        if (!master) return;

        if (data.health) {
            actor.system.attributes.hp = foundry.utils.mergeObject(
                new game.pf2e.StatisticModifier("hp"),
                master.system.attributes.hp
            );
        }

        // the following is only for characters
        if (!master.isOfType("character") || !actor.isOfType("character")) return;

        if (data.heroPoints) {
            actor.system.resources.heroPoints = foundry.utils.deepClone(
                master.system.resources.heroPoints
            );
        }

        if (data.spellcasting) {
            actor.system.resources.focus = foundry.utils.deepClone(master.system.resources.focus);
        }

        if (data.skills) {
            const Statistic = getStatisticCls(actor);

            for (const [slug, skill] of R.entries(CONFIG.PF2E.skills)) {
                const { rank } = master.skills[slug];
                const currentRank = actor.skills[slug].rank;
                if (currentRank >= rank) continue;

                const attribute = skill.attribute;

                const statistic = new Statistic(actor, {
                    slug,
                    label: skill.label,
                    attribute,
                    domains: [slug, `${attribute}-based`, "skill-check", "all"],
                    modifiers: [],
                    lore: false,
                    rank,
                    check: { type: "skill-check" },
                });

                actor.skills[slug] = statistic;
                actor.system.skills[slug] = foundry.utils.mergeObject(
                    statistic.getTraceData() as CharacterSkillData,
                    { attribute, rank }
                );
            }
        }
    }

    #actorPrepareBaseData(actor: CreaturePF2e, wrapped: libWrapper.RegisterCallback) {
        wrapped();

        // we are a master, we skip
        if (getSlavesInMemory(actor)?.size) return;

        const flag = this.getFlag<ShareDataSource>(actor, "data");
        const data = flag ? new ShareDataModel(flag) : undefined;
        const master = data?.master;

        if (!master) {
            this.deleteInMemory(actor, "data");
            return;
        }

        this.setInMemory(actor, "data", data);

        if (data.timeEvents) {
            actor.flags.pf2e.rollOptions.all = foundry.utils.mergeObject(
                actor.flags.pf2e.rollOptions.all,
                createEncounterRollOptions(master)
            );
        }

        const slaves = getSlavesInMemory(master);

        if (!slaves) {
            this.setInMemory(master, "slaves", new Set([actor.uuid]));
        } else {
            slaves.add(actor.uuid);
        }
    }

    #actorPrepareDerivedData(actor: CreaturePF2e, wrapped: libWrapper.RegisterCallback) {
        if (!game.ready) {
            return wrapped();
        }

        const data = getShareDataInMemory(actor);
        const master = data?.master;

        if (!data || !master?.isOfType("character")) {
            return wrapped();
        }

        if (data.armorRunes) {
            const wornArmor = master.wornArmor;
            const armor = wornArmor?.isInvested ? wornArmor : undefined;
            const bracers = R.pipe(
                master.itemTypes.equipment,
                R.filter((item): item is EquipmentPF2e<CharacterPF2e> & { slug: string } => {
                    return BANDS_OF_FORCE_SLUGS.includes(item.slug as any) && !!item.isInvested;
                }),
                R.sortBy([(item) => item.slug, "desc"]),
                R.first()
            );

            const bracerBonus = (bracers ? BANDS_OF_FORCE_SLUGS.indexOf(bracers.slug) : -1) + 1;

            if (armor || bracerBonus) {
                for (const selector of ["ac", "saving-throw"] as const) {
                    const runeType = selector === "ac" ? "potency" : "resilient";
                    const armorBonus = armor?.system.runes[runeType] || 0;
                    if (!armorBonus && !bracerBonus) continue;

                    const construct = (options: DeferredValueParams = {}): ModifierPF2e | null => {
                        const label = armorBonus > bracerBonus ? armor!.name : bracers!.name;
                        const slug = game.pf2e.system.sluggify(label);

                        const modifierType: ModifierType =
                            selector === "saving-throw"
                                ? "item"
                                : includesAny(actor.system.traits.value, ["eidolon", "eldamon"])
                                ? "potency"
                                : "item";

                        const modifier = new game.pf2e.Modifier({
                            slug,
                            label,
                            modifier: Math.max(armorBonus, bracerBonus),
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
            const Statistic = getStatisticCls(actor);

            actor.spellcasting.base = new Statistic(actor, {
                slug: "base-spellcasting",
                label: "PF2E.Actor.Creature.Spellcasting.Label",
                rank: master.system.proficiencies.spellcasting.rank,
                domains: ["all", "spell-attack-dc"],
                check: { type: "attack-roll" },
            });
        }
    }

    #onGetCreatureSheetPF2eHeaderButtons(
        sheet: CreatureSheetPF2e<CreaturePF2e>,
        buttons: ApplicationHeaderButton[]
    ) {
        const actor = sheet.actor;
        if (!isValidSlave(actor)) return;

        buttons.unshift({
            class: "share-data",
            icon: "fa-solid fa-share-all",
            label: this.localizePath("share"),
            onclick: () => {
                new ShareDataConfig(actor, this).render(true);
            },
        });
    }
}

function getStatisticCls(actor: CreaturePF2e) {
    return actor.skills.acrobatics.constructor as ConstructorOf<CharacterSkill<CharacterPF2e>>;
}

function getShareOptionInMemory(actor: CreaturePF2e, option: ShareDataType): boolean {
    return !!getShareDataInMemory(actor)?.[option];
}

function getMasterIfOption(actor: CreaturePF2e, option: ShareDataType): CreaturePF2e | null {
    const data = getShareDataInMemory(actor);
    return data?.[option] ? data.master : null;
}

function createCombatant(actor: CreaturePF2e, encounter: EncounterPF2e) {
    const scene = encounter.scene;
    const token = getFirstActiveToken(actor, scene);
    const CombatantPF2e = getDocumentClass("Combatant");

    return new CombatantPF2e(
        { tokenId: token?.id, actorId: actor.id, hidden: false, sceneId: scene.id },
        { parent: encounter }
    );
}

function isInvalidNonCombatantSlave(slave: CreaturePF2e): boolean {
    return slave.inCombat || !getShareOptionInMemory(slave, "timeEvents");
}

function removeSlaveFromMemory(master: CreaturePF2e, slave: CreaturePF2e) {
    const slaves = getSlavesInMemory(master);
    slaves?.delete(slave.uuid);
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

export { ShareDataTool };
