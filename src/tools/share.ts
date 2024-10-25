import {
    BANDS_OF_FORCE_SLUGS,
    R,
    SKILL_SLUGS,
    calculateRemainingDuration,
    createHTMLElement,
    getFirstActiveToken,
    getStatisticClass,
    htmlQuery,
    isInstanceOf,
    isPlayedActor,
    libWrapper,
    resetActors,
} from "foundry-pf2e";
import { createTool } from "../tool";
import { WEAPON_PREPARE_BASE_DATA } from "./shared/prepareDocument";

const characterShareOptions = ["health", "turn", "skills", "hero", "weapon", "armor"] as const;
const npcShareOptions = ["health", "turn", "armor"] as const;

const {
    config,
    settings,
    hooks,
    wrappers,
    localize,
    render,
    getFlag,
    unsetFlag,
    flagPath,
    getFlagProperty,
    getInMemory,
    setInMemory,
} = createTool({
    name: "share",
    settings: [
        {
            key: "enabled",
            type: Boolean,
            default: false,
            requiresReload: true,
        },
    ],
    wrappers: [
        {
            path: "DocumentSheet.prototype._renderInner",
            callback: documentSheetRenderInner,
        },
        {
            path: "CONFIG.Actor.documentClass.prototype.prepareBaseData",
            callback: actorPrepareBaseData,
        },
        {
            path: "CONFIG.Actor.documentClass.prototype.prepareDerivedData",
            callback: actorPrepareDerivedData,
        },
        {
            path: "CONFIG.Actor.documentClass.prototype.prepareData",
            callback: actorPrepareData,
        },
        {
            path: "CONFIG.Combatant.documentClass.prototype.startTurn",
            callback: combatantStartTurn,
        },
        {
            path: "CONFIG.Combatant.documentClass.prototype.endTurn",
            callback: combatantEndTurn,
        },
        {
            path: "CONFIG.Combatant.documentClass.prototype._onUpdate",
            callback: combatantOnUpdate,
        },
        {
            path: "game.pf2e.actions.restForTheNight",
            callback: restForTheNight,
        },
        {
            path: "CONFIG.Combat.documentClass.prototype.resetActors",
            callback: combatResetActors,
            type: "OVERRIDE",
        },
        {
            path: "CONFIG.PF2E.Item.documentClasses.effect.prototype.remainingDuration",
            callback: effectRemainingDuration,
            type: "OVERRIDE",
        },
        {
            path: WEAPON_PREPARE_BASE_DATA,
            callback: weaponPrepareBaseData,
        },
    ],
    hooks: [
        {
            event: "updateActor",
            listener: onUpdateActor,
        },
        {
            event: "deleteActor",
            listener: onDeleteActor,
        },
    ],
    init: (isGM) => {
        const enabled = settings.enabled;

        hooks.toggleAll(enabled);
        wrappers.toggleAll(enabled);
    },
} as const);

async function documentSheetRenderInner(
    this: DocumentSheet,
    wrapped: libWrapper.RegisterCallback,
    ...args: any[]
): Promise<JQuery> {
    const $html = await wrapped(...args);
    if (!game.user.isGM || !isInstanceOf(this, "CreatureConfig")) return $html;

    const actor = this.actor;
    if (!isPlayedActor(actor) || !actor.isOfType("character", "npc")) return $html;

    const config = getFlag<ConfigFlags>(actor, "config");

    const masters = getSlaves(actor).length
        ? []
        : game.actors
              .filter((x): x is CharacterPF2e<null> => isValidMaster(x, actor.id))
              .map((x) => ({ value: x.id, label: x.name }));

    const shareOptions = actor.isOfType("character") ? characterShareOptions : npcShareOptions;
    const groups = shareOptions.map((group) => ({
        label: localize("config", group, "label"),
        hint: localize("config", group, "hint"),
        checked: config?.[group] ?? false,
        input: flagPath("config", group),
    }));

    const html = $html[0];
    const template = await render("config", {
        masterInput: flagPath("config.master"),
        masters,
        masterId: config?.master ?? "",
        groups,
    });

    const configElements = createHTMLElement("div", { innerHTML: template });

    const btnElement = htmlQuery(html, ":scope > button[type='submit']");
    btnElement?.before(...configElements.children);

    return $html;
}

function weaponPrepareBaseData(this: WeaponPF2e) {
    const actor = this.actor;
    if (!actor?.isOfType("character")) return;

    const { config, master } = getMasterAndConfig(actor) ?? {};
    if (!config?.weapon || !master) return;

    const weapon = R.pipe(
        master.itemTypes.weapon,
        R.filter((item) => !!item.isInvested && !!item.system.runes.property),
        R.sortBy(
            [(item) => item.system.runes.property, "desc"],
            [(item) => item.system.runes.striking, "desc"],
            [(item) => item.system.runes.property.length, "desc"]
        ),
        R.first()
    );

    if (!weapon) return;

    this.system.runes.potency = weapon.system.runes.potency;
    this.system.runes.striking = weapon.system.runes.striking;
    this.system.runes.property = weapon.system.runes.property.slice();
}

function effectRemainingDuration(this: EffectPF2e) {
    const actor = this.actor;
    const master = actor ? getMaster(actor) : undefined;

    return calculateRemainingDuration(this, this.system.duration, master);
}

async function combatResetActors(this: EncounterPF2e): Promise<void> {
    const actors = R.pipe(
        this.combatants.contents,
        R.flatMap((combatant) => {
            const actor = combatant.actor;

            if (!actor) return [];
            if (!actor.isOfType("character")) return [actor];

            const familiar = actor.familiar;
            const slaves = getSlaves(actor, "turn");

            return [actor, familiar, ...slaves];
        }),
        R.filter(R.isTruthy)
    );

    resetActors(actors, { sheets: false, tokens: true });
}

async function combatantStartTurn(
    this: CombatantPF2e,
    wrapped: libWrapper.RegisterCallback
): Promise<void> {
    await wrapped();

    const { actor, encounter } = this;
    if (!encounter || !actor?.isOfType("character", "npc")) return;

    const slaves = getSlaves(actor, "turn");

    for (const slave of slaves) {
        if (slave.inCombat) return;

        const eventType = "turn-start";
        const slaveUpdates: Record<string, unknown> = {};

        for (const rule of slave?.rules ?? []) {
            await rule.onUpdateEncounter?.({ event: eventType, actorUpdates: slaveUpdates });
        }

        await slave.update(slaveUpdates);
        await slave.recharge({ duration: "round" });

        for (const effect of slave.itemTypes.effect) {
            await effect.onEncounterEvent(eventType);
        }

        if (slave.isOfType("character") && slave.familiar) {
            for (const effect of slave.familiar.itemTypes.effect) {
                await effect.onEncounterEvent(eventType);
            }
        }

        const combatant = createCombatant(slave, encounter);
        Hooks.callAll("pf2e.startTurn", combatant, encounter, game.user.id);
    }
}

async function combatantEndTurn(
    this: CombatantPF2e,
    wrapped: libWrapper.RegisterCallback,
    options: { round: number }
): Promise<void> {
    await wrapped(options);

    const { actor, encounter } = this;
    if (!encounter || !actor?.isOfType("character", "npc")) return;

    const slaves = getSlaves(actor, "turn");

    for (const slave of slaves) {
        if (slave.inCombat) return;

        const scene = game.scenes.get(this.sceneId!);
        const token = slave.getDependentTokens({
            linked: true,
            scenes: scene ? [scene] : undefined,
        })[0];

        const activeConditions = slave.conditions.active;
        for (const condition of activeConditions) {
            await condition.onEndTurn({ token });
        }

        const eventType = "turn-end";

        for (const effect of slave.itemTypes.effect) {
            await effect.onEncounterEvent(eventType);
        }

        if (slave.isOfType("character") && slave.familiar) {
            for (const effect of slave.familiar.itemTypes.effect) {
                await effect.onEncounterEvent(eventType);
            }
        }

        const combatant = createCombatant(slave, encounter);
        Hooks.callAll("pf2e.endTurn", combatant, encounter, game.user.id);
    }
}

function combatantOnUpdate(
    this: CombatantPF2e,
    wrapped: libWrapper.RegisterCallback,
    changed: DeepPartial<CombatantSource>,
    operation: DatabaseUpdateOperation<EncounterPF2e>,
    userId: string
): void {
    wrapped(changed, operation, userId);

    if (typeof changed.initiative !== "number" || userId !== game.user.id) return;

    const actor = this.actor;
    if (!actor?.isOfType("character", "npc")) return;

    Promise.resolve().then(async (): Promise<void> => {
        const slaves = getSlaves(actor, "turn");

        for (const slave of slaves) {
            if (slave.inCombat) return;

            const eventType = "initiative-roll";
            const slaveUpdates: Record<string, unknown> = {};

            for (const rule of slave?.rules ?? []) {
                await rule.onUpdateEncounter?.({ event: eventType, actorUpdates: slaveUpdates });
            }

            await slave.update(slaveUpdates);

            for (const effect of slave.itemTypes.effect) {
                await effect.onEncounterEvent(eventType);
            }
        }
    });
}

async function restForTheNight(
    wrapped: libWrapper.RegisterCallback,
    options: RestForTheNightOptions
): Promise<ChatMessagePF2e[]> {
    const actors = options.actors instanceof Actor ? [options.actors] : options.actors;
    if (!Array.isArray(actors)) {
        return wrapped(options);
    }

    options.actors = actors.slice();

    for (const actor of actors ?? []) {
        if (!actor.isOfType("character", "npc")) continue;

        const slaves = getSlaves(actor, "turn");

        for (const slave of slaves) {
            if (!actors.includes(slave)) {
                options.actors.push(slave);
            }
        }
    }

    return wrapped(options);
}

function createCombatant(actor: ShareActor, encounter: EncounterPF2e) {
    const scene = encounter.scene;
    const CombatantPF2e = getDocumentClass("Combatant");
    const token = getFirstActiveToken(actor, false, true, scene);

    return new CombatantPF2e(
        { tokenId: token?.id, actorId: actor.id, hidden: false, sceneId: scene.id },
        { parent: encounter }
    );
}

function onDeleteActor(actor: ActorPF2e) {
    if (!actor.primaryUpdater || !actor.isOfType("character", "npc")) return;

    const master = getMaster(actor);
    if (master) {
        removeSlave(master, actor);
    }

    const slaves = getSlaves(actor);
    for (const slave of slaves) {
        unsetFlag(slave, "config.master");
    }
}

function onUpdateActor(actor: ActorPF2e, changed: DeepPartial<ActorSourcePF2e>) {
    const isCharacter = actor.isOfType("character");
    if ((!isCharacter && !actor.isOfType("npc")) || actor.primaryUpdater !== game.user) return;

    const masterUpdate = getFlagProperty<string>(changed, "config.master");
    if (masterUpdate !== undefined) {
        const master = getMaster(actor);

        if (master) {
            removeSlave(master, actor);
        }
    }

    const data = getMasterAndConfig(actor);
    if (!data) return;

    const { master, config } = data;

    if (config.health) {
        const update = foundry.utils.getProperty<CharacterHitPoints>(
            changed,
            "system.attributes.hp"
        );
        if (update) {
            master.update({ "system.attributes.hp": foundry.utils.deepClone(update) });
        }
    }

    if (isCharacter && config.hero) {
        const update = foundry.utils.getProperty<ValueAndMax>(
            changed,
            "system.resources.heroPoints"
        );
        if (update) {
            master.update({ "system.resources.heroPoints": foundry.utils.deepClone(update) });
        }
    }
}

function actorPrepareBaseData(this: ActorPF2e, wrapped: libWrapper.RegisterCallback) {
    wrapped();

    if (!this.isOfType("character", "npc")) return;

    const master = getMaster(this);
    if (!master) return;

    const slaveUUID = this.uuid;
    const slaveUUIDs = getInMemory<string[]>(master, "slaves");

    if (!slaveUUIDs) {
        setInMemory(master, "slaves", [slaveUUID]);
    } else if (!slaveUUIDs.includes(slaveUUID)) {
        slaveUUIDs.push(slaveUUID);
    }
}

function removeSlave(master: CharacterPF2e, slave: ActorPF2e) {
    const slaveUUIDs = getInMemory<string[]>(master, "slaves");
    if (!slaveUUIDs) return;

    const slaveUUID = slave.uuid;
    const slaveIndex = slaveUUIDs.indexOf(slaveUUID);

    if (slaveIndex !== -1) {
        slaveUUIDs.splice(slaveIndex, 1);
    }
}

function actorPrepareDerivedData(this: ActorPF2e, wrapped: libWrapper.RegisterCallback) {
    if (!game.ready || !this.isOfType("character", "npc")) return wrapped();

    const { master, config } = getMasterAndConfig(this) ?? {};
    if (!config?.armor || !master) return wrapped();

    const armor = master.wornArmor;
    const bracers = R.pipe(
        master.itemTypes.equipment,
        R.filter(
            (
                item
            ): item is EquipmentPF2e<CharacterPF2e> & {
                slug: (typeof BANDS_OF_FORCE_SLUGS)[number];
            } => BANDS_OF_FORCE_SLUGS.includes(item.slug) && !!item.isInvested
        ),
        R.sortBy([(item) => item.slug, "desc"]),
        R.first()
    );

    const bracerBonus = (bracers ? BANDS_OF_FORCE_SLUGS.indexOf(bracers.slug) : -1) + 1;

    if (!armor?.isInvested && !bracerBonus) return wrapped();

    const bonuses = ["ac", "saving-throw"] as const;

    for (const selector of bonuses) {
        const armorBonus = armor?.system.runes[selector === "ac" ? "potency" : "resilient"] || 0;
        if (!armorBonus && !bracerBonus) continue;

        const construct = (options: DeferredValueParams = {}): ModifierPF2e | null => {
            const label = armorBonus > bracerBonus ? armor!.name : bracers!.name;
            const slug = game.pf2e.system.sluggify(label);

            const modifier = new game.pf2e.Modifier({
                slug,
                label,
                modifier: Math.max(armorBonus, bracerBonus),
                type: "potency",
            });

            if (options.test) modifier.test(options.test);

            return modifier;
        };

        const modifiers = (this.synthetics.modifiers[selector] ??= []);
        modifiers.push(construct);
    }

    wrapped();
}

function actorPrepareData(this: ActorPF2e, wrapped: libWrapper.RegisterCallback) {
    wrapped();

    const isCharacter = this.isOfType("character");
    if (!game.ready || (!isCharacter && !this.isOfType("npc"))) return;

    const slaves = getSlaves(this);
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

    const { master, config } = getMasterAndConfig(this) ?? {};
    if (!config || !master) return;

    if (config.health) {
        const masterHp = master.system.attributes.hp;
        this.system.attributes.hp = foundry.utils.mergeObject(
            new game.pf2e.StatisticModifier("hp"),
            masterHp
        );
    }

    if (isCharacter && config.hero) {
        this.system.resources.heroPoints.max = master.system.resources.heroPoints.max;
        this.system.resources.heroPoints.value = master.system.resources.heroPoints.value;
    }

    if (isCharacter && config.skills) {
        const Statistic = getStatisticClass(this.skills.acrobatics);

        for (const skillSlug of SKILL_SLUGS) {
            const masterSkill = master.skills[skillSlug];
            const currentRank = this.skills[skillSlug].rank ?? 0;
            if (currentRank > masterSkill.rank) continue;

            const attribute = CONFIG.PF2E.skills[skillSlug].attribute;
            const statistic = new Statistic(this, {
                slug: skillSlug,
                label: CONFIG.PF2E.skills[skillSlug]?.label ?? skillSlug,
                attribute,
                domains: [skillSlug, `${attribute}-based`, "skill-check", "all"],
                modifiers: [],
                lore: false,
                rank: masterSkill.rank,
                check: { type: "skill-check" },
            }) as CharacterSkill;

            this.skills[skillSlug] = statistic;
            this.system.skills[skillSlug] = foundry.utils.mergeObject(
                statistic.getTraceData() as CharacterSkillData,
                {
                    attribute,
                    rank: masterSkill.rank,
                }
            );
        }
    }
}

function getMaster(actor: ActorPF2e) {
    const result = getMasterAndConfig(actor);
    return result?.master;
}

function getMasterAndConfig(actor: ActorPF2e) {
    const config = getFlag<ConfigFlags>(actor, "config");
    if (!config?.master) return;

    const master = game.actors.get(config.master) as ActorPF2e;
    return isValidMaster(master) ? { master, config } : undefined;
}

function getSlaves(actor: ActorPF2e, withConfig?: ConfigOption) {
    return R.pipe(
        getInMemory<string[]>(actor, "slaves") ?? [],
        R.map((slaveUUID) => fromUuidSync(slaveUUID)),
        R.filter(R.isTruthy),
        R.filter(
            (slave): slave is ShareActor =>
                isValidSlave(slave) && (!withConfig || !!getFlag(slave, "config", withConfig))
        )
    );
}

function isValidSlave(actor: FoundryDocument | CompendiumIndexData): actor is ShareActor {
    return (
        isInstanceOf(actor, "ActorPF2e") &&
        isPlayedActor(actor) &&
        actor.isOfType("character", "npc")
    );
}

function isValidMaster(actor: ActorPF2e | null | undefined, id?: string): actor is CharacterPF2e {
    return (
        isPlayedActor(actor) &&
        !!actor.prototypeToken.actorLink &&
        (!id || actor.id !== id) &&
        actor.isOfType("character") &&
        !actor.traits.has("eidolon") &&
        !actor.traits.has("minion") &&
        !getFlag(actor, "config.master")
    );
}

type ConfigOption = (typeof characterShareOptions)[number];

type ConfigFlags = { [k in ConfigOption]: boolean } & {
    master: string;
};

type ShareActor = CharacterPF2e | NPCPF2e;

export { config as ShareTool };
