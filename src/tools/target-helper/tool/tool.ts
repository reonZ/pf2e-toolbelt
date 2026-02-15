import {
    ChatMessagePF2e,
    createEmitable,
    createToggleHook,
    createToggleWrapper,
    refreshLatestMessages,
    SaveType,
    TokenDocumentUUID,
} from "foundry-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";
import { RerollType, sharedMessageRenderHTML } from "tools";
import { TargetsData } from "..";

class TargetHelperTool extends ModuleTool<ToolSettings> {
    #updateQueue = new foundry.utils.Semaphore(1);

    #debounceRefreshMessages = foundry.utils.debounce(() => {
        refreshLatestMessages(20);
    }, 100);

    updateMessageEmitable = createEmitable(this.key, (options: UpdateMessageOptions, userId: string) => {
        this.#updateQueue.add(this.#updateMessage.bind(this), options, userId);
    });

    #textEditorEnrichHTMLWrapper = createToggleWrapper(
        "WRAPPER",
        "CONFIG.ux.TextEditor.enrichHTML",
        this.#textEditorEnrichHTML,
        { context: this },
    );

    #messageRenderHTMLWrapper = sharedMessageRenderHTML.register(this.#messageRenderHTML, {
        context: this,
    });

    #preCreateChatMessageHook = createToggleHook("preCreateChatMessage", this.#onPreCreateChatMessage.bind(this));

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
                    this.#debounceRefreshMessages();
                },
            },
        ];
    }

    get api(): toolbelt.Api["targetHelper"] {
        return {
            getMessageTargets: this.getMessageTargets.bind(this),
            setMessageFlagTargets: this.setMessageFlagTargets.bind(this),
        };
    }

    init(): void {
        if (!this.settings.enabled) return;

        this.updateMessageEmitable.activate();
        this.#preCreateChatMessageHook.activate();
        this.#textEditorEnrichHTMLWrapper.activate();
        this.#messageRenderHTMLWrapper.toggle(this.settings.targets || this.settings.checks);

        document.body.addEventListener("dragstart", this.#onDragStart.bind(this), true);
    }

    _configurate(): void {
        this.#messageRenderHTMLWrapper.toggle(this.settings.enabled && (this.settings.targets || this.settings.checks));
        this.#debounceRefreshMessages();
    }

    getMessageTargets(message: ChatMessagePF2e): TokenDocumentUUID[] | undefined {
        return this.getFlag(message, "targets");
    }

    setMessageTargets(message: ChatMessagePF2e, targets: TokenDocumentUUID[]): Promise<ChatMessagePF2e> {
        return this.setFlag(message, "targets", targets);
    }

    setMessageFlagTargets<T extends Record<string, unknown>>(updates: T, targets: TokenDocumentUUID[]): T {
        return this.setFlagProperty(updates, "targets", targets);
    }

    async #updateMessage({ message, applied, saves, variantId }: UpdateMessageOptions, _userId: string) {
        const flag = this.getTargetsFlagData(message);
        if (!flag) return;

        const data = new TargetsData(flag, variantId);

        if (applied) {
            data.update({ applied: this.#applyDamageUpdates(data, applied) });
        }

        if (saves) {
            data.updateSaves(saves);
        }

        await data.setFlag();
    }

    #applyDamageUpdates(data: TargetsData, { rollIndex, targetId }: UpdateMessageApplied): MessageApplied {
        const splashIndex = data.splashIndex;

        const targetApplied: MessageApplied[number] = {
            [rollIndex]: true,
        };

        const applied: MessageApplied = {
            [targetId]: targetApplied,
        };

        if (splashIndex !== -1) {
            const regularIndex = data.regularIndex;

            if (rollIndex === splashIndex) {
                targetApplied[regularIndex] = true;
            } else {
                targetApplied[splashIndex] = true;

                for (const otherTarget of data.targets) {
                    const otherId = otherTarget.id;
                    if (otherId === targetId) continue;

                    applied[otherId] = { [regularIndex]: true };
                }
            }
        }

        return applied;
    }

    #onDragStart(event: DragEvent) {
        const target = event.target;
        const dataTransfer = event.dataTransfer;
        const saveData = getSaveLinkData(target);
        if (!dataTransfer || !saveData) return;

        event.stopPropagation();

        dataTransfer.setData(
            "text/plain",
            JSON.stringify({ ...saveData, type: `${MODULE.id}-check-roll` } satisfies SaveDragData),
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

        // if (flag.type === "action") {
        //     this.settings.targets && (await renderActionMessage.call(this, message, html, flag));
        // } else if (flag.type === "area") {
        //     this.settings.targets && (await renderAreaMessage.call(this, message, html, flag));
        // } else if (flag.type === "check") {
        //     this.settings.checks && (await renderCheckMessage.call(this, message, html, flag));
        // } else if (flag.type === "damage") {
        //     this.settings.targets && (await renderDamageMessage.call(this, message, html, flag));
        // } else if (flag.type === "spell") {
        //     this.settings.targets && (await renderSpellMessage.call(this, message, html, flag));
        // }
    }
}

const targetHelperTool = new TargetHelperTool();

type ToolSettings = {
    checks: boolean;
    enabled: boolean;
    small: boolean;
    targets: boolean;
};
type RerollDetails = {
    icon: string;
    reroll: string;
    rerolled: string;
};

type UpdateMessageOptions = {
    applied?: UpdateMessageApplied;
    message: ChatMessagePF2e;
    saves?: Record<string, toolbelt.targetHelper.TargetSaveInstance>;
    variantId?: string;
};

type UpdateMessageApplied = {
    targetId: string;
    rollIndex: number;
};

export { targetHelperTool };
export type { TargetHelperTool };
