import { MODULE } from "foundry-helpers";
import { clearDebug, drawDebug, drawDebugText } from "./debug";
import { api as geometry } from "./geometry";

export * from "./debug";
export * from "./geometry";
export * from "./vector";

MODULE.apiExpose("canvas", {
    debug: {
        clearDebug,
        drawDebug,
        drawDebugText,
    },
    geometry,
});
