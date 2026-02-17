import {
    ChatMessagePF2e,
    createEmitable,
    createToggleHook,
    createToggleWrapper,
    getCurrentTargets,
    isActionMessage,
    isSpellMessage,
    MODULE,
    refreshLatestMessages,
    TextEditorPF2e,
    TokenDocumentPF2e,
    TokenDocumentUUID,
} from "foundry-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";
import { sharedMessageRenderHTML } from "tools";
import {
    getSaveLinkData,
    isAreaMessage,
    isDamageMessage,
    prepareActionMessage,
    prepareAreaMessage,
    prepareCheckMessage,
    prepareDamageMessage,
    prepareSpellMessage,
    renderActionMessage,
    SaveDragData,
} from ".";
import {
    AppliedDamagesSource,
    SaveVariants,
    TargetsAppliedDamagesSources,
    TargetSaveInstanceSource,
    TargetsData,
    TargetsDataSource,
    zSaveVariants,
    zTargetsData,
    zTokenDocumentArray,
} from "..";

const INLINE_CHECK_REGEX = /(data-pf2-check="[\w]+")/g;

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

    getMessageTargets(message: ChatMessagePF2e): TokenDocumentPF2e[] | undefined {
        const flag = this.getFlag<TokenDocumentUUID[]>(message, "targets");
        return flag ? zTokenDocumentArray.safeDecode(flag)?.data : undefined;
    }

    setMessageTargets(message: ChatMessagePF2e, targets: TokenDocumentUUID[]): Promise<ChatMessagePF2e> {
        return this.setFlag(message, "targets", targets);
    }

    setMessageFlagTargets<T extends Record<string, unknown>>(updates: T, targets: TokenDocumentUUID[]): T {
        return this.setFlagProperty(updates, "targets", targets);
    }

    getMessageSaveVariants(message: ChatMessagePF2e): SaveVariants | undefined {
        const flag = this.getFlag(message, "saveVariants");
        return flag ? zSaveVariants.safeParse(flag)?.data : undefined;
    }

    getMessageData(message: ChatMessagePF2e): TargetsData | undefined {
        const flag = this.getFlag<TargetsDataSource>(message);
        return flag ? zTargetsData.safeParse(flag)?.data : undefined;
    }

    setMessageData(message: ChatMessagePF2e, data: TargetsData | TargetsDataSource): Promise<ChatMessagePF2e> {
        const encoded = "encode" in data ? data.encode() : data;
        return this.setFlag(message, encoded);
    }

    getCurrentTargets(): TokenDocumentUUID[] {
        return getCurrentTargets({ types: ["creature", "hazard", "vehicle"], uuid: true });
    }

    async #updateMessage({ message, applied, saves, variantId = "null" }: UpdateMessageOptions, _userId: string) {
        const data = this.getMessageData(message);
        if (!data) return;

        if (applied) {
            const udpate = { applied: this.#applyDamageUpdates(data, applied) };
            foundry.utils.mergeObject(data, udpate, { inplace: true });
        }

        if (saves) {
            const update = { [`saveVariants.${variantId}.saves`]: saves };
            foundry.utils.mergeObject(data, update, { inplace: true });
        }

        this.setMessageData(message, data);
    }

    #applyDamageUpdates(
        data: TargetsData,
        { rollIndex, targetId }: UpdateMessageApplied,
    ): TargetsAppliedDamagesSources {
        const splashIndex = data.splashIndex;

        const targetApplied: AppliedDamagesSource = {
            [rollIndex]: true,
        };

        const applied: TargetsAppliedDamagesSources = {
            [targetId]: targetApplied,
        };

        if (splashIndex !== -1) {
            const regularIndex = data.splashIndex === 0 ? 1 : 0;

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
        _editor: TextEditorPF2e,
        wrapped: libWrapper.RegisterCallback,
        ...args: any[]
    ): Promise<string> {
        const enriched = (await wrapped(...args)) as string;
        return enriched.replace(INLINE_CHECK_REGEX, "$1 draggable='true'");
    }

    #onPreCreateChatMessage(message: ChatMessagePF2e) {
        if (message.isCheckRoll) return;

        const updates = {} as TargetsDataSource;

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

        if (!updates.targets?.length && !this.getMessageTargets(message)?.length) {
            updates.targets = this.getCurrentTargets();
        }

        this.updateSourceFlag(message, updates);
    }

    async #messageRenderHTML(message: ChatMessagePF2e, html: HTMLElement) {
        const data = this.getMessageData(message);
        if (!data) return;

        if (data.type === "action") {
            this.settings.targets && (await renderActionMessage.call(this, message, html, data));
        } else if (data.type === "area") {
            // this.settings.targets && (await renderAreaMessage.call(this, message, html, data));
        } else if (data.type === "check") {
            // this.settings.checks && (await renderCheckMessage.call(this, message, html, data));
        } else if (data.type === "damage") {
            // this.settings.targets && (await renderDamageMessage.call(this, message, html, data));
        } else if (data.type === "spell") {
            // this.settings.targets && (await renderSpellMessage.call(this, message, html, data));
        }
    }
}

const targetHelperTool = new TargetHelperTool();

type ToolSettings = {
    checks: boolean;
    enabled: boolean;
    small: boolean;
    targets: boolean;
};

type UpdateMessageOptions = {
    applied?: UpdateMessageApplied;
    message: ChatMessagePF2e;
    saves?: Record<string, TargetSaveInstanceSource>;
    variantId?: string;
};

type UpdateMessageApplied = {
    targetId: string;
    rollIndex: number;
};

export { targetHelperTool };
export type { TargetHelperTool };
