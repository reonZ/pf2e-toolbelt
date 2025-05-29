import { TargetDataModelSource, TargetHelperTool } from "..";
import { ChatMessagePF2e } from "module-helpers";

function prepareActionMessage(
    this: TargetHelperTool,
    message: ChatMessagePF2e,
    updates: DeepPartial<TargetDataModelSource>
): boolean {
    updates.type = "action";
    // TODO look at the message for a single save link and add it to the message
    return true;
}

function isActionMessage(message: ChatMessagePF2e): boolean {
    const type = message.getFlag("pf2e", "origin.type") as string | undefined;
    return !!type && ["feat", "action"].includes(type);
}

export { isActionMessage, prepareActionMessage };
