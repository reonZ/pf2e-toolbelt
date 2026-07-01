import {
    CanvasVisibilityTestConfiguration,
    DetectionMode,
    isTokenObject,
    registerWrapper,
    TokenDetectionMode,
    TokenPF2e,
} from "foundry-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";

class PerceptionTool extends ModuleTool<ToolSettings> {
    get key(): "perception" {
        return "perception";
    }

    get settingsSchema(): ToolSettingsList<ToolSettings> {
        return [];
    }

    init(): void {
        registerWrapper(
            "OVERRIDE",
            "foundry.canvas.perception.DetectionMode.prototype.testVisibility",
            this.#detectionModeTestVisibility,
            this,
        );
        registerWrapper(
            "WRAPPER",
            "CONFIG.Canvas.detectionModes.basicSight._canDetect",
            this.#basicSightCanDetect,
            this,
        );
    }

    #detectionModeTestVisibility(
        detection: DetectionMode,
        visionSource: PointVisionSourcePF2e,
        mode: TokenDetectionMode,
        config: VisibilityConfig,
    ): boolean {
        if (!mode.enabled) return false;
        // @ts-ignore
        if (!detection["_canDetect"](visionSource, config.object, config.level, config)) return false;
        return config.tests.some((test) => detection["_testPoint"](visionSource, mode, config.object, test));
    }

    #basicSightCanDetect(
        _detection: DetectionMode,
        wrapped: libWrapper.RegisterCallback,
        visionSource: PointVisionSourcePF2e,
        target: TokenPF2e | object | null,
        level: Level,
        config: VisibilityConfig,
    ): boolean {
        if (
            target instanceof foundry.canvas.placeables.PlaceableObject &&
            !this.#testPerception(visionSource, target, config)
        ) {
            return false;
        }
        return wrapped(visionSource, target, level);
    }

    #testPerception(
        visionSource: PointVisionSourcePF2e,
        targetToken: object | null,
        config: VisibilityConfig,
    ): boolean {
        if (!isTokenObject(targetToken)) return true;

        const originToken = visionSource.object;
        const origin = originToken.actor;
        const target = targetToken.actor;
        if (!origin || !target) return true;

        // const undetected = target.conditions.

        return true;
    }
}

type ToolSettings = {};

type PointVisionSourcePF2e = fc.sources.PointVisionSource<TokenPF2e>;

type VisibilityConfig = CanvasVisibilityTestConfiguration;

declare class Level {}

export { PerceptionTool };
