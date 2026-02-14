import { ChatMessagePF2e, TokenDocumentUUID } from "foundry-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";

class TargetHelperTool extends ModuleTool<ToolSettings> {
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

    getMessageTargets(message: ChatMessagePF2e): TokenDocumentUUID[] | undefined {}

    setMessageTargets(message: ChatMessagePF2e, targets: TokenDocumentUUID[]) {}
}

const targetHelperTool = new TargetHelperTool();

type ToolSettings = {
    checks: boolean;
    enabled: boolean;
    small: boolean;
    targets: boolean;
};

export { targetHelperTool };
export type { TargetHelperTool };
