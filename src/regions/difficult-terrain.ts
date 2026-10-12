import {
    DifficultTerrainBehaviorType,
    ModelPropsFromSchema,
    ModifyMovementCostBehaviorSchema,
    RegionDocumentPF2e,
    TokenDocumentPF2e,
} from "foundry-helpers";
import {
    actorIsAffected,
    defineAffectsSchema,
    definedOriginSchema,
    getBehaviorOriginActor,
    SharedRegionAffectsSchemaField,
    SharedRegionOriginSchemaField,
} from ".";

function createDifficultTerrainRegion() {
    const SystemCls = CONFIG.RegionBehavior.dataModels.modifyMovementCost as typeof DifficultTerrainBehaviorType;

    class ToolbeltDifficultTerrainBehaviorType extends SystemCls {
        static defineSchema(): ToolbeltDifficultTerrainBehaviorSchema {
            return {
                affects: defineAffectsSchema(),
                origin: definedOriginSchema(false),
                ...super.defineSchema(),
            };
        }

        protected _getTerrainEffects(
            token: TokenDocumentPF2e,
            segment: TerrainEffectSegment,
        ): { name: "difficulty"; difficulty: number }[] {
            const actor = token.actor;
            const origin = getBehaviorOriginActor.call(this);
            if (!actor || !actorIsAffected.call(this, actor, origin)) return [];

            const difficulty = this.difficulties[segment.action];
            if (difficulty === 1 || difficulty === null) return [];
            return [{ name: "difficulty", difficulty }];
        }
    }

    interface ToolbeltDifficultTerrainBehaviorType extends ModelPropsFromSchema<ToolbeltDifficultTerrainBehaviorSchema> {
        get region(): RegionDocumentPF2e;
    }

    return ToolbeltDifficultTerrainBehaviorType;
}

type TerrainEffectSegment = Pick<foundry.documents.TokenMovementWaypoint, "width" | "height" | "shape" | "action"> & {
    preview: boolean;
};

type ToolbeltDifficultTerrainBehaviorSchema = ModifyMovementCostBehaviorSchema & {
    affects: SharedRegionAffectsSchemaField;
    origin: SharedRegionOriginSchemaField<"actor">;
};

export { createDifficultTerrainRegion };
