import {
    ChatMessagePF2e,
    createEmitable,
    createHook,
    createToggleableWrapper,
    isActionMessage,
    isSpellMessage,
    MODULE,
    refreshLatestMessages,
    SaveType,
    TextEditorPF2e,
} from "module-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";
import { sharedMessageRenderHTML } from "tools";
import {
    getCurrentTargets,
    getSaveLinkData,
    isAreaMessage,
    isDamageMessage,
    prepareActionMessage,
    prepareAreaMessage,
    prepareCheckMessage,
    prepareDamageMessage,
    prepareSpellMessage,
    renderActionMessage,
    renderAreaMessage,
    renderCheckMessage,
    renderDamageMessage,
    renderSpellMessage,
    SaveRollData,
    TargetsFlagData,
} from ".";
import {
    RerollType,
    SaveDragData,
    TargetsData,
    TargetsDataModel,
    TargetsDataSource,
    TargetsSaveSource,
} from "..";
import utils = foundry.utils;

class TargetHelperTool extends ModuleTool<ToolSettings> {
    #debounceRefreshMessages = utils.debounce(() => {
        refreshLatestMessages(20);
    }, 100);

    updateMessageEmitable = createEmitable(this.key, this.#updateMessage.bind(this));

    #textEditorEnrichHTMLWrapper = createToggleableWrapper(
        "WRAPPER",
        "CONFIG.ux.TextEditor.enrichHTML",
        this.#textEditorEnrichHTML,
        { context: this }
    );

    #messageRenderHTMLWrapper = sharedMessageRenderHTML.register(this.#messageRenderHTML, {
        context: this,
    });

    #preCreateChatMessageHook = createHook(
        "preCreateChatMessage",
        this.#onPreCreateChatMessage.bind(this)
    );

    static INLINE_CHECK_REGEX = /(data-pf2-check="[\w]+")/g;

    static SAVES_DETAILS: Record<SaveType, { icon: string; label: string }> = {
        fortitude: { icon: "fa-solid fa-chess-rook", label: "PF2E.SavesFortitude" },
        reflex: { icon: "fa-solid fa-person-running", label: "PF2E.SavesReflex" },
        will: { icon: "fa-solid fa-brain", label: "PF2E.SavesWill" },
    };

    static REROLL: Record<RerollType, RerollDetails> = {
        hero: {
            icon: "fa-solid fa-hospital-symbol",
            reroll: "PF2E.RerollMenu.HeroPoint",
            rerolled: "PF2E.RerollMenu.MessageHeroPoints",
        },
        mythic: {
            icon: "fa-solid fa-circle-m",
            reroll: "PF2E.RerollMenu.MythicPoint",
            rerolled: "PF2E.RerollMenu.MessageMythicPoints",
        },
        new: {
            icon: "fa-solid fa-dice",
            reroll: "PF2E.RerollMenu.KeepNew",
            rerolled: "PF2E.RerollMenu.MessageKeep.new",
        },
        lower: {
            icon: "fa-solid fa-dice-one",
            reroll: "PF2E.RerollMenu.KeepLower",
            rerolled: "PF2E.RerollMenu.MessageKeep.lower",
        },
        higher: {
            icon: "fa-solid fa-dice-six",
            reroll: "PF2E.RerollMenu.KeepHigher",
            rerolled: "PF2E.RerollMenu.MessageKeep.higher",
        },
    };

    static THIRD_PATH_TO_PERFECTION = "Compendium.pf2e.classfeatures.Item.haoTkr2U5k7kaAKN";

    static LEGENDARY_SAVES = [
        "Compendium.pf2e.classfeatures.Item.TuL0UfqH14MtqYVh", // Greater Juggernaut
        "Compendium.pf2e.classfeatures.Item.XFcCeBYqeXgfiA84", // Greater Dogged Will
        "Compendium.pf2e.classfeatures.Item.rpLPCkTXCZlQ51SR", // Greater Natural Reflexes
        "Compendium.pf2e.classfeatures.Item.BTpL6XvMk4jvVYYJ", // Greater Rogue Reflexes
        "Compendium.pf2e.classfeatures.Item.syEkISIi0F9946zo", // Assured Evasion
        "Compendium.pf2e.classfeatures.Item.Kj59CmXnMJDKXKWx", // Greater Mysterious Resolve
        "Compendium.pf2e.classfeatures.Item.mRobjNNsABQdUUZq", // Greater Performer's Heart
        "Compendium.pf2e.classfeatures.Item.Hw6Ji7Fgx0XkVkac", // Fortress of Will
        "Compendium.pf2e.classfeatures.Item.5LOARurr4qWkfS9K", // Greater Resolve
        "Compendium.pf2e.classfeatures.Item.i3qjbhL7uukg9I80", // Greater Kinetic Durability
    ];

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
                onChange: (value) => {
                    this.configurate();
                },
            },
            {
                key: "small",
                type: Boolean,
                default: true,
                scope: "user",
                onChange: () => {
                    this.#debounceRefreshMessages();
                },
            },
        ];
    }

    get api(): toolbelt.ToolbeltApi["targetHelper"] {
        return {
            getMessageTargets: this.getMessageTargets.bind(this),
            setMessageFlagTargets: (updates: Record<string, any>, targets: string[]) => {
                this.setFlagProperty(updates, "targets", targets);
                return updates;
            },
        };
    }

    init(isGM: boolean): void {
        if (!this.settings.enabled) return;

        this.updateMessageEmitable.activate();
        this.#preCreateChatMessageHook.activate();
        this.#textEditorEnrichHTMLWrapper.activate();
        this.#messageRenderHTMLWrapper.toggle(this.settings.targets || this.settings.checks);

        document.body.addEventListener("dragstart", this.#onDragStart.bind(this), true);
    }

    _configurate(): void {
        this.#messageRenderHTMLWrapper.toggle(
            this.settings.enabled && (this.settings.targets || this.settings.checks)
        );
        this.#debounceRefreshMessages();
    }

    getTargetsFlagData(message: ChatMessagePF2e): TargetsFlagData | undefined {
        return this.getDataFlag(message, TargetsDataModel, { strict: true });
    }

    getMessageTargets(message: ChatMessagePF2e): TokenDocumentUUID[] {
        return this.getFlag(message, "targets") ?? [];
    }

    getMessageSave(message: ChatMessagePF2e): TargetsSaveSource | undefined {
        return this.getFlag(message, "save");
    }

    #updateMessage({ message, applied, saves, variantId }: UpdateMessageOptions, userId: string) {
        const flag = this.getTargetsFlagData(message);
        if (!flag) return;

        const data = new TargetsData(flag, variantId);

        if (applied) {
            data.update({ applied });
        }

        if (saves) {
            data.updateSaves(saves);
        }

        data.setFlag();
    }

    #onDragStart(event: DragEvent) {
        const target = event.target;
        const dataTransfer = event.dataTransfer;
        const saveData = getSaveLinkData(target);
        if (!dataTransfer || !saveData) return;

        event.stopPropagation();

        dataTransfer.setData(
            "text/plain",
            JSON.stringify({ ...saveData, type: `${MODULE.id}-check-roll` } satisfies SaveDragData)
        );
    }

    async #textEditorEnrichHTML(
        editor: TextEditorPF2e,
        wrapped: libWrapper.RegisterCallback,
        ...args: any[]
    ): Promise<string> {
        const enriched = (await wrapped(...args)) as string;
        return enriched.replace(TargetHelperTool.INLINE_CHECK_REGEX, "$1 draggable='true'");
    }

    #onPreCreateChatMessage(message: ChatMessagePF2e) {
        if (message.isCheckRoll) return;

        const updates: DeepPartial<TargetsDataSource> = {};

        if (isAreaMessage(message)) {
            if (!prepareAreaMessage.call(this, message, updates)) return;
        } else if (isDamageMessage(message)) {
            if (!prepareDamageMessage.call(this, message, updates)) return;
        } else if (isSpellMessage(message)) {
            if (!prepareSpellMessage.call(this, message, updates)) return;
        } else if (
            !prepareCheckMessage.call(this, message, updates) &&
            (!isActionMessage(message) || !prepareActionMessage.call(this, message, updates))
        ) {
            return;
        }

        if (!this.getMessageTargets(message).length && !updates.targets?.length) {
            updates.targets = getCurrentTargets();
        }

        this.updateSourceFlag(message, updates);
    }

    async #messageRenderHTML(message: ChatMessagePF2e, html: HTMLElement) {
        const flag = this.getTargetsFlagData(message);
        if (!flag) return;

        if (flag.type === "action") {
            this.settings.targets && (await renderActionMessage.call(this, message, html, flag));
        } else if (flag.type === "area") {
            this.settings.targets && (await renderAreaMessage.call(this, message, html, flag));
        } else if (flag.type === "check") {
            this.settings.checks && (await renderCheckMessage.call(this, message, html, flag));
        } else if (flag.type === "damage") {
            this.settings.targets && (await renderDamageMessage.call(this, message, html, flag));
        } else if (flag.type === "spell") {
            this.settings.targets && (await renderSpellMessage.call(this, message, html, flag));
        }
    }
}

type ToolSettings = {
    checks: boolean;
    enabled: boolean;
    small: boolean;
    targets: boolean;
};

type UpdateMessageOptions = {
    applied?: MessageApplied;
    message: ChatMessagePF2e;
    saves?: Record<string, SaveRollData>;
    variantId?: string;
};

type MessageApplied = Record<string, toolbelt.targetHelper.MessageTargetApplied>;

type RerollDetails = { icon: string; reroll: string; rerolled: string };

export { TargetHelperTool };
export type { RerollDetails };
