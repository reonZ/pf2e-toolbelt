import {
    BANDS_OF_FORCE_SLUGS,
    R,
    SKILL_ABBREVIATIONS,
    SKILL_DICTIONARY,
    SKILL_EXPANDED,
    beforeHTMLFromString,
    calculateRemainingDuration,
    getStatisticClass,
    htmlElement,
    isInstanceOf,
    isPlayedActor,
    libWrapper,
    querySelector,
    resetActors,
    type BandsOfForceSlug,
} from "pf2e-api";
import { createTool } from "../tool";
import { WEAPON_PREPARE_BASE_DATA } from "./shared/prepareDocument";

const shareOptions = ["health", "turn", "skills", "weapon", "armor"] as const;

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
    deleteInMemory,
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
    if (!game.user.isGM || !isInstanceOf<CreatureConfig>(this, "CreatureConfig")) return $html;

    const actor = this.actor;
    if (!isPlayedActor(actor) || !actor.isOfType("character", "npc")) return $html;

    const config = getFlag<ConfigFlags>(actor, "config");

    const masters =
        !actor.prototypeToken.actorLink || getSlave(actor)
            ? []
            : game.actors
                  .filter((x): x is CharacterPF2e | NPCPF2e =>
                      isValidMaster(x as ActorPF2e, actor.id)
                  )
                  .map((x) => ({ value: x.id, label: x.name }));

    const groups = shareOptions.map((group) => ({
        label: localize("config", group, "label"),
        hint: localize("config", group, "hint"),
        checked: config?.[group] ?? false,
        input: flagPath("config", group),
    }));

    const html = htmlElement($html);
    const template = await render("config", {
        masterInput: flagPath("config.master"),
        masters,
        masterId: config?.master ?? "",
        groups,
    });

    const btn = querySelector(html, ":scope > button[type='submit']");
    beforeHTMLFromString(btn, template);

    return $html;
}

function weaponPrepareBaseData(this: WeaponPF2e) {
    const actor = this.actor;
    if (!actor?.isOfType("character", "npc")) return;

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
            const slave = getSlave(actor, "turn");

            return [actor, familiar, slave];
        }),
        R.compact
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

    const slave = getSlave(actor, "turn");
    if (!slave || slave.combatant) return;

    const eventType = "turn-start";
    const slaveUpdates: Record<string, unknown> = {};

    for (const rule of slave?.rules ?? []) {
        await rule.onUpdateEncounter?.({ event: eventType, actorUpdates: slaveUpdates });
    }

    await slave?.update(slaveUpdates);

    for (const effect of slave.itemTypes.effect) {
        await effect.onEncounterEvent(eventType);
    }

    if (slave.isOfType("character") && slave.familiar) {
        for (const effect of slave.familiar.itemTypes.effect) {
            await effect.onEncounterEvent(eventType);
        }
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

    const slave = getSlave(actor, "turn");
    if (!slave || slave.combatant) return;

    const scene = game.scenes.get<ScenePF2e>(this.sceneId);
    const token = slave.getDependentTokens({ linked: true, scenes: scene })[0];

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
}

function onDeleteActor(actor: ActorPF2e) {
    if (!actor.primaryUpdater || !actor.isOfType("character", "npc")) return;

    const master = getMaster(actor);
    if (master) {
        deleteInMemory(master, "slave");
    }

    const slave = getSlave(actor);
    if (slave) {
        unsetFlag(slave, "config.master");
    }
}

function onUpdateActor(actor: ActorPF2e, changed: DeepPartial<ActorSourcePF2e>) {
    if (!actor.primaryUpdater || !actor.isOfType("character", "npc")) return;

    const masterUpdate = getFlagProperty<string>(changed, "config.master");
    if (masterUpdate !== undefined) {
        const master = getMaster(actor);

        if (master) {
            deleteInMemory(master, "slave");
        }
    }

    const master = getMaster(actor);
    if (master) {
        if (!getFlag(actor, "config.health")) return;

        const hpUpdate = getProperty(changed, "system.attributes.hp");
        master.update({ "system.attributes.hp": hpUpdate });

        return;
    }
}

function actorPrepareBaseData(this: ActorPF2e, wrapped: libWrapper.RegisterCallback) {
    wrapped();

    if (!this.isOfType("character", "npc")) return;

    const master = getMaster(this);
    if (!master) return;

    setInMemory(master, "slave", this.id);
}

function actorPrepareDerivedData(this: ActorPF2e, wrapped: libWrapper.RegisterCallback) {
    if (!game.ready || !this.isOfType("character", "npc")) return wrapped();

    const { master, config } = getMasterAndConfig(this) ?? {};
    if (!config?.armor || !master) return wrapped();

    const armor = master.wornArmor;
    const bracers = R.pipe(
        master.itemTypes.equipment,
        R.filter(
            (item): item is EquipmentPF2e<CharacterPF2e> & { slug: BandsOfForceSlug } =>
                BANDS_OF_FORCE_SLUGS.includes(item.slug as BandsOfForceSlug) && !!item.isInvested
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

    if (!game.ready || !this.isOfType("character", "npc")) return;

    const slave = getSlave(this);
    if (slave) {
        slave.reset();
        slave.sheet.render();

        for (const token of slave.getActiveTokens(true, false)) {
            token.renderFlags.set({ refreshBars: true });
        }

        return;
    }

    const { master, config } = getMasterAndConfig(this) ?? {};
    if (!config || !master) return;

    if (config.health) {
        const masterHp = master.system.attributes.hp;
        this.system.attributes.hp = mergeObject(new game.pf2e.StatisticModifier("hp"), masterHp);
    }

    if (config.skills) {
        const Statistic = getStatisticClass(this.skills.acrobatics);

        for (const shortForm of SKILL_ABBREVIATIONS) {
            const longForm = SKILL_DICTIONARY[shortForm];
            const masterSkill = master.skills[longForm];
            const currentRank = this.skills[longForm].rank ?? 0;
            if (currentRank > masterSkill.rank) continue;

            const attribute = SKILL_EXPANDED[longForm].attribute;
            const statistic = new Statistic(this, {
                slug: longForm,
                label: CONFIG.PF2E.skills[shortForm] ?? longForm,
                attribute,
                domains: [longForm, `${attribute}-based`, "skill-check", "all"],
                modifiers: [],
                lore: false,
                rank: masterSkill.rank,
                check: { type: "skill-check" },
            });

            // @ts-ignore
            this.skills[longForm] = statistic;
            // @ts-ignore
            this.system.skills[shortForm] = mergeObject(statistic.getTraceData(), {
                attribute,
                rank: masterSkill.rank,
            });
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

    const master = game.actors.get<ActorPF2e>(config.master);
    return isValidMaster(master) ? { master, config } : undefined;
}

function getSlave(actor: ActorPF2e, withConfig?: ConfigOption) {
    const slaveId = getInMemory<string>(actor, "slave");
    if (!slaveId) return;

    const slave = game.actors.get<ActorPF2e>(slaveId);
    if (!isValidSlave(slave)) return;

    return !withConfig || getFlag(slave, "config", withConfig) ? slave : undefined;
}

function isValidSlave(actor: ActorPF2e | null | undefined): actor is ShareActor {
    return (
        !!actor?.id &&
        !actor.pack &&
        !!actor.prototypeToken.actorLink &&
        actor.isOfType("character", "npc")
    );
}

function isValidMaster(actor: ActorPF2e | null | undefined, id?: string): actor is CharacterPF2e {
    return (
        !!actor?.id &&
        !actor.pack &&
        !!actor.prototypeToken.actorLink &&
        (!id || actor.id !== id) &&
        actor.isOfType("character") &&
        !actor.traits.has("eidolon") &&
        !actor.traits.has("minion") &&
        !getFlag(actor, "config.master")
    );
}

type ConfigOption = (typeof shareOptions)[number];

type ConfigFlags = { [k in ConfigOption]: boolean } & {
    master: string;
};

type ShareActor = CharacterPF2e | NPCPF2e;

export { config as ShareTool };
