export * from "./_shared";

import { MODULE } from "foundry-helpers";
import { PF2eToolbeltEffectRegionBehaviorType } from "./effect";
import { createDifficultTerrainRegion } from "./difficult-terrain";

const REGIONS: ToolbeltRegionData[] = [
    { class: createDifficultTerrainRegion, icon: "fa-solid fa-shoe-prints", name: "difficult-terrain" },
    { class: PF2eToolbeltEffectRegionBehaviorType, icon: "fa-solid fa-person-rays", name: "effect" },
];

function initializeRegions() {
    for (const region of REGIONS) {
        const path = MODULE.path(region.name);
        const cls = isRegionBehaviorType(region.class) ? region.class : region.class();
        CONFIG.RegionBehavior.typeIcons[path] = region.icon;
        CONFIG.RegionBehavior.dataModels[path] = cls;
        cls.__initialize?.();
    }
}

function isRegionBehaviorType(cls: (typeof REGIONS)[number]["class"]): cls is RegionBehaviorType {
    return cls.prototype instanceof foundry.data.regionBehaviors.RegionBehaviorType;
}

type ToolbeltRegionData = {
    class: RegionBehaviorType | (() => RegionBehaviorType);
    icon: string;
    name: string;
};

type RegionBehaviorType = { new (): foundry.data.regionBehaviors.RegionBehaviorType; __initialize?: () => void };

export { initializeRegions };
