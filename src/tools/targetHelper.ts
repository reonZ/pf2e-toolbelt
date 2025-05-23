import { ChatMessagePF2e } from "module-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";

class TargetHelperTool extends ModuleTool<ToolSettings> {
    get key(): "targetHelper" {
        return "targetHelper";
    }

    get settingsSchema(): ToolSettingsList<ToolSettings> {
        return [];
    }

    get api() {
        return {
            getMessageTargets: this.getMessageTargets.bind(this),
            setMessageFlagTargets: (updates: Record<string, any>, targets: string[]) => {
                this.setFlagProperty(updates, "targets", targets);
                return updates;
            },
        };
    }

    getMessageFlag<TFlag extends keyof MessageFlag>(message: ChatMessagePF2e, flag: TFlag) {
        return this.getFlag<MessageFlag[TFlag]>(message, flag);
    }

    getMessageTargets(message: ChatMessagePF2e) {
        return this.getMessageFlag(message, "targets") ?? [];
    }
}

type MessageFlag = toolbelt.targetHelper.MessageFlag;

type ToolSettings = {};

export { TargetHelperTool };
