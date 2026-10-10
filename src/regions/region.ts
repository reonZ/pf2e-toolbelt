import {
    ActorPF2e,
    ActorUUID,
    EffectPF2e,
    getFlag,
    ItemPF2e,
    ItemUUID,
    Localize,
    localize,
    ModelPropsFromSchema,
    MODULE,
    R,
    RegionEventPF2e,
    RegionEventType,
    setFlagProperty,
    TokenDocumentPF2e,
} from "foundry-helpers";
import fields = foundry.data.fields;

const EVENTS = ["tokenEnter", "tokenExit"] as const satisfies RegionEventType[];

class PF2eToolbeltEffectRegionBehaviorType extends foundry.data.regionBehaviors.RegionBehaviorType {
    static #i18n: Localize = localize.sub("regions.effect");

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

    static get localize(): Localize {
        return this.#i18n;
    }

    static initialize() {
        Hooks.on("preDeleteItem", (item: ItemPF2e, context: { forceDelete?: boolean }) => {
            if (
                item.type === "effect" &&
                !item.pack &&
                item.actor &&
                !context.forceDelete &&
                getFlag(item, "regions.effect")
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
        return this.behavior?.uuid;
    }

    async _handleRegionEvent(event: EffectRegionEvent): Promise<void> {
        if (!this.uuid || !game.user.isActiveGM || !this.region || !this.behavior) return;

        const actor = event.data.token.actor;
        if (!actor) return;

        this.#process(event.name, actor);
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
        const exist = this.#getExistingEffect(actor);
        if (exist) return;

        const source = (await fromUuid<EffectPF2e>(this.uuid ?? ""))?.toObject();
        if (!source) return;

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

interface PF2eToolbeltEffectRegionBehaviorType extends ModelPropsFromSchema<EffectRegionSchema> {}

type EffectRegionSchema = {
    origin: fields.SchemaField<EffectRegionOriginSchema>;
    uuid: fields.DocumentUUIDField<ItemUUID>;
};

type EffectRegionOriginSchema = {
    actor: fields.DocumentUUIDField<ActorUUID, false>;
    item: fields.DocumentUUIDField<ItemUUID, false>;
};

type EffectRegionEvent = Omit<RegionEventPF2e, "data" | "name"> & {
    data: { token: TokenDocumentPF2e };
    name: EventName;
};

type EventName = (typeof EVENTS)[number];

export { PF2eToolbeltEffectRegionBehaviorType };
