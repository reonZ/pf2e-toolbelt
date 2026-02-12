import { ModuleTool, ToolSettingsList } from "module-tool";

export class TargetHelperTool extends ModuleTool<ToolSettings> {
    get key(): "targetHelper" {
        return "targetHelper";
    }

    get settingsSchema(): ToolSettingsList<ToolSettings> {
        return [
            {
                key: "enabled",
                type: Boolean,
                default: false,
                scope: "world",
                requiresReload: true,
            },
            {
                key: "targets",
                type: Boolean,
                default: true,
                scope: "user",
                onChange: () => {
                    this.configurate();
                },
            },
            {
                key: "checks",
                type: Boolean,
                default: true,
                scope: "user",
                onChange: () => {
                    this.configurate();
                },
            },
            {
                key: "small",
                type: Boolean,
                default: true,
                scope: "user",
                onChange: () => {
                    // this.#debounceRefreshMessages();
                },
            },
        ];
    }
}

type ToolSettings = {
    checks: boolean;
    enabled: boolean;
    small: boolean;
    targets: boolean;
};
