import {
    ChatMessagePF2e,
    createToggleHook,
    DamageDamageContextFlag,
    DamageRoll,
    refreshLatestMessages,
    Rolled,
    RollJSON,
    SYSTEM,
    toggleHooksAndWrappers,
    TokenDocumentUUID,
} from "foundry-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";
import { targetHelperTool } from "tools";
import { injectDamage, mergeDamages, MergeOptions, renderChatMessageMergeDamage } from ".";
import { htmlQuery } from "foundry-helpers/src";

const AVERAGE_SETTING_TYPES = ["disabled", "standalone", "background"] as const;

class BetterChatTool extends ModuleTool<ToolSettings> {
    #mergeDamageHooks = [
        createToggleHook("renderChatMessageHTML", renderChatMessageMergeDamage.bind(this)),
        createToggleHook("diceSoNiceMessageProcessed", this.#onDiceSoNiceMessageProcessed.bind(this)),
    ];

    #averageHook = createToggleHook("renderChatMessageHTML", this.#renderChatMessageAverageDamage.bind(this));

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
            {
                key: "average",
                type: String,
                default: "disabled",
                scope: "user",
                choices: AVERAGE_SETTING_TYPES,
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
        this.configurate();
    }

    _configurate(): void {
        this.#averageHook.toggle(this.settings.average !== "disabled");
        toggleHooksAndWrappers(this.#mergeDamageHooks, this.settings.merge || this.settings.inject);
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

    #renderChatMessageAverageDamage(message: ChatMessagePF2e, html: HTMLElement) {
        if (!message.isDamageRoll) return;

        const roll = message.rolls.find((roll): roll is Rolled<DamageRoll> => !roll.options.splashOnly);
        if (!roll || (!roll.options.showBreakdown && !game.user.isGM)) return;

        const minValue = roll.minimumValue;
        const maxValue = roll.maximumValue;
        if (minValue === maxValue) return;

        const total = roll.total;
        const ratio = (total - minValue) / (maxValue - minValue);
        const hue = (1 - ratio) * 120;

        if (this.settings.average === "background") {
            const formulaElement = htmlQuery(html, ".message-content .dice-result .dice-formula");

            formulaElement?.classList.add("show-average");
            formulaElement?.style.setProperty("--average-ratio", `${ratio}`);
            formulaElement?.style.setProperty("--average-hue", `${hue}`);

            return;
        }

        const diceRollElement = htmlQuery(html, ".dice-roll.damage-roll");

        const template = `<div class="average-display" style="--average-ratio: ${ratio}; --average-hue: ${hue}">
            <span>${minValue}</span>
            <span>${maxValue}</span>
        </div>`;

        diceRollElement?.insertAdjacentHTML("beforebegin", template);
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
    average: (typeof AVERAGE_SETTING_TYPES)[number];
    inject: boolean;
    merge: boolean;
};

export { BetterChatTool };
