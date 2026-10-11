import {
    ActorPF2e,
    actorsRespectAlliance,
    ActorUUID,
    CompendiumIndexData,
    EffectPF2e,
    getFlag,
    ItemPF2e,
    ItemUUID,
    Localize,
    localize,
    ModelPropsFromSchema,
    MODULE,
    R,
    RegionBehaviorPF2e,
    RegionDocumentPF2e,
    RegionEventPF2e,
    RegionEventType,
    setFlagProperty,
    SYSTEM,
    TokenDocumentPF2e,
} from "foundry-helpers";
import fields = foundry.data.fields;

const AFFECTS = ["all", "party", "opposition", "allies", "enemies"] as const;
const EVENTS = ["tokenEnter", "tokenExit"] as const satisfies RegionEventType[];

class PF2eToolbeltEffectRegionBehaviorType extends foundry.data.regionBehaviors.RegionBehaviorType {
    static #alliances?: Record<RegionAffects, string>;
    static #types?: Record<string, string>;

    static localize: Localize = localize.sub("regions.effect");

    static defineSchema(): EffectRegionSchema {
        return {
            uuid: new fields.DocumentUUIDField({
                required: true,
                type: "Item",
                embedded: false,
                label: this.localize.path("uuid.label"),
                hint: this.localize.path("uuid.hint"),
                validate: (uuid) => R.isString(uuid) && fromUuidSync<ItemPF2e>(uuid)?.type === "effect",
                validationError: this.localize("uuid.error"),
            }),
            affects: new fields.SchemaField({
                types: new fields.SetField(
                    new fields.StringField({
                        choices: (this.#types ??= R.pipe(
                            CONFIG.PF2E.Actor.documentClasses,
                            R.omitBy((cls, type) => {
                                const tmp = new cls({ name: "__", type });
                                return !R.isIncludedIn("effect", tmp.allowedItemTypes);
                            }),
                            R.mapValues((__, type) => `TYPES.Actor.${type}`),
                        )),
                    }),
                    {
                        label: this.localize.path("affects.types.label"),
                        hint: this.localize.path("affects.types.hint"),
                    },
                ),
                alliance: new fields.StringField({
                    required: false,
                    nullable: false,
                    initial: "all",
                    choices: (this.#alliances ??= R.fromKeys(AFFECTS, (type) =>
                        this.localize.path("affects.alliance.choices", type),
                    )),
                    label: this.localize.path("affects.alliance.label"),
                    hint: this.localize.path("affects.alliance.hint"),
                }),
            }),
            level: new fields.NumberField({
                required: false,
                integer: true,
                positive: true,
                label: this.localize.path("level.label"),
                hint: this.localize.path("level.hint"),
            }),
            origin: new fields.SchemaField({
                actor: new fields.DocumentUUIDField({
                    required: false,
                    type: "Actor",
                    hint: this.localize.path("origin.hint"),
                    label: this.localize.path("origin.actor.label"),
                    validate: (uuid) => R.isString(uuid) && !fromUuidSync(uuid)?.pack,
                    validationError: this.localize("origin.actor"),
                }),
                item: new fields.DocumentUUIDField({
                    required: false,
                    type: "Item",
                    hint: this.localize.path("origin.hint"),
                    label: this.localize.path("origin.item.label"),
                }),
            }),
        };
    }

    static initialize() {
        Hooks.on("preDeleteItem", (item: ItemPF2e, { forceDelete }: { forceDelete?: boolean }) => {
            if (
                !forceDelete &&
                item.type === "effect" &&
                !item.pack &&
                !!item.actor &&
                !!(item.flags[MODULE.id]?.regions as { effect?: string } | undefined)?.effect &&
                !(item as EffectPF2e).system.expired
            ) {
                this.localize.error("locked.notify");
                const error = this.localize("locked.console", {
                    actor: item.actor.id,
                    context: `{forceDelete: true}`,
                    item: item.id,
                });
                MODULE.error(error);
                return false;
            }
        });
    }

    #queue: Record<ActorUUID, { event: EventName; actor: ActorPF2e }> = {};
    #active: Record<ActorUUID, boolean> = {};

    override events = new Set<RegionEventType>(EVENTS);

    get uniqueId() {
        return this.behavior.uuid;
    }

    async _handleRegionEvent(event: EffectRegionEvent): Promise<void> {
        if (!this.uuid || !game.user.isActiveGM || !this.region || !this.behavior) return;

        const actor = event.data.token.actor;
        if (!actor || !R.isIncludedIn("effect", actor.allowedItemTypes)) return;

        this.#process(event.name, actor);
    }

    isAffectedAlliance(actor: ActorPF2e, origin: Maybe<ActorUUID>): boolean {
        const affects = this.affects.alliance;

        switch (affects) {
            case "all": {
                return true;
            }

            case "party":
            case "opposition": {
                return actor.alliance === affects;
            }

            case "allies":
            case "enemies": {
                const originActor = origin ? fromUuidSync<ActorPF2e | CompendiumIndexData>(origin) : null;
                return originActor instanceof Actor
                    ? actorsRespectAlliance(originActor, actor, affects)
                    : actor.alliance === (affects === "allies" ? "party" : "opposition");
            }
        }
    }

    isAffectedType(actor: ActorPF2e): boolean {
        return this.affects.types.size === 0 || this.affects.types.has(actor.type);
    }

    getOrigin(): { actor: ActorUUID; item: ItemUUID | null; options: string[] } | undefined {
        const templateOrigin = this.region.flags[SYSTEM.id].origin;
        const originItem = this.origin.item || templateOrigin?.uuid || null;
        const originActor =
            this.origin.actor ||
            templateOrigin?.actor ||
            (originItem?.startsWith("Actor.") ? originItem.split(".").slice(0, 2).join(".") : null);

        if (!originActor) return;

        return {
            actor: originActor as ActorUUID,
            item: originItem as ItemUUID | null,
            options: templateOrigin?.rollOptions ?? [],
        };
    }

    #process = foundry.utils.debounce(this.#_process.bind(this), 50);

    async #_process(event: EventName, actor: ActorPF2e): Promise<void> {
        const actorUUID = actor.uuid;

        if (this.#active[actorUUID]) {
            this.#queue[actorUUID] = { event, actor };
            return;
        }

        this.#active[actorUUID] = true;

        try {
            if (event === "tokenExit") {
                await this.#removeEffect(actor);
            } else {
                await this.#addEffect(actor);
            }
        } catch {}

        this.#active[actorUUID] = false;

        if (this.#queue[actorUUID]) {
            const { event, actor } = this.#queue[actorUUID];
            delete this.#queue[actorUUID];
            this.#process(event, actor);
        }
    }

    async #addEffect(actor: ActorPF2e): Promise<void> {
        const origin = this.getOrigin();
        if (!this.isAffectedType(actor) || !this.isAffectedAlliance(actor, origin?.actor)) return;

        const exist = this.#getExistingEffect(actor);
        if (exist) return;

        const source = (await fromUuid<EffectPF2e>(this.uuid ?? ""))?.toObject();
        if (!source) return;

        if (origin) {
            source.system.context = {
                origin: {
                    actor: origin.actor,
                    item: origin.item,
                    rollOptions: origin.options,
                    spellcasting: null,
                    token: null,
                },
                roll: null,
                target: null,
            };
        }

        if (this.level) {
            source.system.level.value = this.level;
        }

        setFlagProperty(source, "regions.effect", this.uniqueId);

        await actor.createEmbeddedDocuments("Item", [source]);
    }

    async #removeEffect(actor: ActorPF2e): Promise<void> {
        const exist = this.#getExistingEffect(actor);
        await exist?.delete({ forceDelete: true } as any);
    }

    #getExistingEffect(actor: ActorPF2e): EffectPF2e<ActorPF2e> | undefined {
        return actor.itemTypes.effect.find((effect) => getFlag(effect, "regions.effect") === this.uniqueId);
    }
}

interface PF2eToolbeltEffectRegionBehaviorType extends ModelPropsFromSchema<EffectRegionSchema> {
    get behavior(): RegionBehaviorPF2e;
    get region(): RegionDocumentPF2e;
}

type EffectRegionSchema = {
    affects: fields.SchemaField<EffectRegionAffectsSchema>;
    level: fields.NumberField;
    origin: fields.SchemaField<EffectRegionOriginSchema>;
    uuid: fields.DocumentUUIDField<ItemUUID>;
};

type EffectRegionOriginSchema = {
    actor: fields.DocumentUUIDField<ActorUUID, false>;
    item: fields.DocumentUUIDField<ItemUUID, false>;
};

type EffectRegionAffectsSchema = {
    alliance: fields.StringField<RegionAffects, RegionAffects, false, false, true>;
    types: fields.SetField<fields.StringField>;
};

type RegionAffects = (typeof AFFECTS)[number];

type EffectRegionEvent = Omit<RegionEventPF2e, "data" | "name"> & {
    data: { token: TokenDocumentPF2e };
    name: EventName;
};

type EventName = (typeof EVENTS)[number];

export { PF2eToolbeltEffectRegionBehaviorType };
