import {
    ActorPF2e,
    actorsRespectAlliance,
    ActorUUID,
    CompendiumIndexData,
    ItemUUID,
    localize,
    ModelPropsFromSchema,
    R,
    RegionDocumentPF2e,
    SYSTEM,
} from "foundry-helpers";
import fields = foundry.data.fields;

const i18n = localize.sub("regions.shared");
const AFFECTS = ["all", "party", "opposition", "allies", "enemies"] as const;
let ALLIANCES: Record<RegionAffects, string> | undefined;
let TYPES: Record<string, string> | undefined;

function definedOriginSchema(withItem: true): fields.SchemaField<SharedRegionOriginSchema>;
function definedOriginSchema(withItem: false): fields.SchemaField<SharedRegionOriginSchemaPartial>;
function definedOriginSchema(withItem: boolean) {
    const schema: SharedRegionOriginSchemaPartial = {
        actor: new fields.DocumentUUIDField({
            required: false,
            type: "Actor",
            hint: i18n.path("origin.hint"),
            label: i18n.path("origin.actor.label"),
            validate: (uuid) => R.isString(uuid) && !fromUuidSync(uuid)?.pack,
            validationError: i18n("origin.actor"),
        }),
    };

    if (withItem) {
        schema.item = new fields.DocumentUUIDField({
            required: false,
            type: "Item",
            hint: i18n.path("origin.hint"),
            label: i18n.path("origin.item.label"),
        });
    }

    return new fields.SchemaField(schema);
}

function defineAffectsSchema(): SharedRegionAffectsSchemaField {
    return new fields.SchemaField({
        types: new fields.SetField(
            new fields.StringField({
                choices: (TYPES ??= R.pipe(
                    CONFIG.PF2E.Actor.documentClasses,
                    R.omitBy((cls, type) => {
                        const tmp = new cls({ name: "__", type });
                        return !R.isIncludedIn("effect", tmp.allowedItemTypes);
                    }),
                    R.mapValues((__, type) => `TYPES.Actor.${type}`),
                )),
            }),
            {
                label: i18n.path("affects.types.label"),
                hint: i18n.path("affects.types.hint"),
            },
        ),
        alliance: new fields.StringField({
            required: false,
            nullable: false,
            initial: "all",
            choices: (ALLIANCES ??= R.fromKeys(AFFECTS, (type) => i18n.path("affects.alliance.choices", type))),
            label: i18n.path("affects.alliance.label"),
            hint: i18n.path("affects.alliance.hint"),
        }),
    });
}

function isAffectedAlliance(
    this: { affects: ModelPropsFromSchema<SharedRegionAffectsSchema> },
    actor: ActorPF2e,
    origin: Maybe<ActorUUID>,
): boolean {
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
            return originActor instanceof Actor && actorsRespectAlliance(originActor, actor, affects);
        }
    }
}

function isAffectedType(this: { affects: ModelPropsFromSchema<SharedRegionAffectsSchema> }, actor: ActorPF2e): boolean {
    return this.affects.types.size === 0 || this.affects.types.has(actor.type);
}

function actorIsAffected(
    this: {
        affects: ModelPropsFromSchema<SharedRegionAffectsSchema>;
        origin: ModelPropsFromSchema<SharedRegionOriginSchemaPartial>;
        region?: RegionDocumentPF2e;
    },
    actor: ActorPF2e,
    origin: Maybe<ActorUUID>,
): boolean {
    return isAffectedType.call(this, actor) && isAffectedAlliance.call(this, actor, origin);
}

function getBehaviorOriginActor(this: {
    origin: ModelPropsFromSchema<SharedRegionOriginSchemaPartial>;
    region?: RegionDocumentPF2e;
}): ActorUUID | undefined {
    const templateOrigin = this.region?.flags[SYSTEM.id].origin;
    return this.origin.actor || templateOrigin?.actor;
}

function getBehaviorOrigin(this: {
    origin: ModelPropsFromSchema<SharedRegionOriginSchemaPartial>;
    region?: RegionDocumentPF2e;
}): { actor: ActorUUID; item: ItemUUID | null; options: string[] } | undefined {
    const templateOrigin = this.region?.flags[SYSTEM.id].origin;
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

type SharedRegionAffectsSchema = {
    alliance: fields.StringField<RegionAffects, RegionAffects, false, false, true>;
    types: fields.SetField<fields.StringField>;
};

type SharedRegionAffectsSchemaField = fields.SchemaField<SharedRegionAffectsSchema>;

type SharedRegionOriginSchema = {
    actor: fields.DocumentUUIDField<ActorUUID, false>;
    item: fields.DocumentUUIDField<ItemUUID, false>;
};

type SharedRegionOriginSchemaPartial = WithPartial<SharedRegionOriginSchema, "item">;

type SharedRegionOriginSchemaField<T extends keyof SharedRegionOriginSchema = keyof SharedRegionOriginSchema> =
    fields.SchemaField<Pick<SharedRegionOriginSchema, T>>;

type RegionAffects = (typeof AFFECTS)[number];

export { actorIsAffected, defineAffectsSchema, definedOriginSchema, getBehaviorOrigin, getBehaviorOriginActor };
export type { SharedRegionAffectsSchemaField, SharedRegionOriginSchemaField };
