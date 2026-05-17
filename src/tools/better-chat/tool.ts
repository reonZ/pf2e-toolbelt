import {
    ChatMessagePF2e,
    createToggleHook,
    DamageDamageContextFlag,
    refreshLatestMessages,
    RollJSON,
    SYSTEM,
    TokenDocumentUUID,
} from "foundry-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";
import { targetHelperTool } from "tools";
import { injectDamage, mergeDamages, MergeOptions, renderChatMessageMergeDamage } from ".";

class BetterChatTool extends ModuleTool<ToolSettings> {
    #renderChatMessageHook = createToggleHook("renderChatMessageHTML", this.#onRenderChatMessage.bind(this));
    #diceSoNiceMessageProcessedHook = createToggleHook(
        "renderChatMessageHTML",
        this.#onDiceSoNiceMessageProcessed.bind(this),
    );

    get key(): "betterChat" {
        return "betterChat";
    }

    get settingsSchema(): ToolSettingsList<ToolSettings> {
        return [
            {
                key: "merge",
                type: Boolean,
                default: false,
                scope: "user",
                onChange: () => {
                    this.configurate();
                },
            },
            {
                key: "inject",
                type: Boolean,
                default: false,
                scope: "user",
                onChange: () => {
                    this.configurate();
                },
            },
        ];
    }

    get api(): toolbelt.Api["mergeDamage"] {
        return {
            injectDamageMessage: async (
                previousMessage: ChatMessagePF2e,
                currentMessage: ChatMessagePF2e,
                options: Omit<MergeOptions, "targetMerge"> = {},
            ): Promise<{ rolls: RollJSON[] } | undefined> => {
                if (!previousMessage.isDamageRoll || !currentMessage.isDamageRoll) return;
                return injectDamage.call(this, currentMessage, previousMessage, options);
            },
            mergeDamageMessages: async (
                previousMessage: ChatMessagePF2e,
                currentMessage: ChatMessagePF2e,
                options: MergeOptions = {},
            ): Promise<ChatMessagePF2e | undefined> => {
                if (!previousMessage.isDamageRoll || !currentMessage.isDamageRoll) return;
                return mergeDamages.call(this, currentMessage, previousMessage, options);
            },
        };
    }

    init(): void {
        this._configurate();
    }

    _configurate(): void {
        const inject = this.settings.inject;
        const merge = this.settings.merge;

        this.#renderChatMessageHook.toggle(inject || merge);
        this.#diceSoNiceMessageProcessedHook.toggle(inject || merge);

        refreshLatestMessages(20);
    }

    getMessageTargets(message: ChatMessagePF2e): TokenDocumentUUID[] {
        const targets = targetHelperTool.getMessageTargets(message);

        if (targets) {
            return targets.map((target) => target.uuid);
        }

        const target = (message.flags[SYSTEM.id].context as DamageDamageContextFlag | undefined)?.target?.token;
        return target ? [target] : [];
    }

    async #onRenderChatMessage(message: ChatMessagePF2e, html: HTMLElement) {
        if (this.settings.merge || this.settings.inject) {
            renderChatMessageMergeDamage.call(this, message, html);
        }
    }

    #onDiceSoNiceMessageProcessed(messageId: string, interception: { willTrigger3DRoll: boolean }) {
        const message = game.messages.get(messageId);
        if (!message) return;

        const flag = this.getFlag<{ merged?: boolean; splitted?: boolean }>(message, "mergeDamage") ?? {};

        if (flag.merged || flag.splitted) {
            interception.willTrigger3DRoll = false;
        }
    }
}

type ToolSettings = {
    inject: boolean;
    merge: boolean;
};

export { BetterChatTool };
