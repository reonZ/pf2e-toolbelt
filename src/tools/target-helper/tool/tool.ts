import {
    ActorPF2e,
    ChatMessagePF2e,
    createEmitable,
    createToggleHook,
    createToggleWrapper,
    getCurrentTargets,
    getFirstActiveToken,
    htmlQuery,
    isActionMessage,
    isHoldingModifierKey,
    isSpellMessage,
    ItemOriginFlag,
    MODULE,
    oppositeAlliance,
    refreshLatestMessages,
    RegionDocumentPF2e,
    SYSTEM,
    TextEditorPF2e,
    TokenDocumentPF2e,
    TokenDocumentUUID,
    waitDialog,
} from "foundry-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";
import { lineIntersect, sharedMessageRenderHTML } from "tools";
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
    renderAreaMessage,
    renderCheckMessage,
    renderDamageMessage,
    renderSpellMessage,
    SaveDragData,
    UpdateMessageQueue,
    UpdateMessageQueueOption,
} from ".";
import {
    SaveVariants,
    TargetsData,
    TargetsDataSource,
    zSaveVariants,
    zTargetsData,
    zTokenDocumentArrayDecode,
} from "..";

const COLORBLIND_CLASS = "pf2e-toolbelt-target-helper-save-colorblind";
const INLINE_CHECK_REGEX = /(data-pf2-check="[\w]+")/g;

class TargetHelperTool extends ModuleTool<ToolSettings> {
    #updatesQueue = new UpdateMessageQueue(this);

    #debounceRefreshMessages = foundry.utils.debounce(() => {
        refreshLatestMessages(20);
    }, 100);

    #queryUpdateEmitable = createEmitable(this.key, (options: UpdateMessageQueueOption, userId: string) => {
        this.#updatesQueue.add(options, userId);
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

    #createRegionTemplateHook = createToggleHook("createRegion", this.#onCreateRegion.bind(this));

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
                key: "skipDice",
                type: Boolean,
                default: true,
                scope: "world",
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
            {
                key: "expend",
                type: Boolean,
                default: true,
                scope: "user",
                onChange: () => {
                    this.#debounceRefreshMessages();
                },
            },
            {
                key: "template",
                type: Boolean,
                default: true,
                scope: "user",
                onChange: (value: boolean) => {
                    this.#createRegionTemplateHook.toggle(value);
                },
            },
            {
                key: "colorblind",
                type: Boolean,
                default: false,
                scope: "user",
                onChange: (value: boolean) => {
                    document.body.classList.toggle(COLORBLIND_CLASS, value);
                },
            },
            {
                key: "dismissTemplate",
                type: Boolean,
                default: true,
                scope: "user",
                config: false,
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

        this.#queryUpdateEmitable.activate();
        this.#preCreateChatMessageHook.activate();
        this.#createRegionTemplateHook.toggle(this.settings.template);
        this.#textEditorEnrichHTMLWrapper.activate();
        this.#messageRenderHTMLWrapper.toggle(this.settings.targets || this.settings.checks);

        document.body.classList.toggle(COLORBLIND_CLASS, this.settings.colorblind);
        document.body.addEventListener("dragstart", this.#onDragStart.bind(this), true);
    }

    _configurate(): void {
        this.#messageRenderHTMLWrapper.toggle(this.settings.enabled && (this.settings.targets || this.settings.checks));
        this.#debounceRefreshMessages();
    }

    getMessageTargets(message: ChatMessagePF2e): TokenDocumentPF2e[] | undefined {
        const flag = this.getFlag<TokenDocumentUUID[]>(message, "targets");
        return flag ? zTokenDocumentArrayDecode.safeParse(flag).data : undefined;
    }

    setMessageFlagTargets<T extends Record<string, unknown>>(updates: T, targets: TokenDocumentUUID[]): T {
        return this.setFlagProperty(updates, "targets", targets);
    }

    getMessageSaveVariants(message: ChatMessagePF2e): SaveVariants | undefined {
        const flag = this.getFlag(message, "saveVariants");
        return flag ? zSaveVariants.safeParse(flag).data : undefined;
    }

    getMessageData(message: ChatMessagePF2e): TargetsData | undefined {
        const flag = this.getFlag<TargetsDataSource>(message);
        return flag ? zTargetsData.safeParse(flag).data : undefined;
    }

    getCurrentTargets(): TokenDocumentUUID[] {
        return getCurrentTargets({ types: ["creature", "hazard", "vehicle"], uuid: true });
    }

    queryMessageUpdate(options: UpdateMessageQueueOption) {
        return this.#queryUpdateEmitable.call(options);
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

    async #onCreateRegion(region: RegionDocumentPF2e, _context: any, userId: string) {
        const user = game.user;

        if (
            user.id !== userId ||
            !canvas.scene ||
            !region.isEffectArea ||
            isHoldingModifierKey("Control") ||
            this.getFlag(region, "skip")
        )
            return;

        const shape = region.shapes.at(0);
        const flagOrigin = region.flags[SYSTEM.id].origin as (ItemOriginFlag & { name: string }) | undefined;
        if (!flagOrigin || !shape) return;

        const dismiss = this.settings.dismissTemplate;
        const actor = flagOrigin?.actor ? await fromUuid<ActorPF2e>(flagOrigin.actor) : null;
        const self = actor ? getFirstActiveToken(actor)?.object : undefined;

        const result = await waitDialog<TemplateDialogData | Pick<TemplateDialogData, "dismiss">>({
            content: this.templatePath("template"),
            i18n: this.path("template"),
            title: flagOrigin?.name,
            classes: ["pf2e-toolbelt-template-helper"],
            data: {
                noSelf: !self,
                dismiss,
            },
            no: {
                callback: (_event, _btn, dialog) => {
                    return {
                        dismiss: !!htmlQuery<HTMLInputElement>(dialog.element, `[name="dismiss"]`)?.checked,
                    };
                },
            },
        });

        if (!result) return;

        const returnAndDismiss = () => {
            if (dismiss !== result.dismiss) {
                this.settings.dismissTemplate = result.dismiss;
            }
            if (result.dismiss && region.rendered) {
                region.delete();
            }
            return;
        };

        if (!("targets" in result)) {
            return returnAndDismiss();
        }

        const alliance = actor ? actor.alliance : user.isGM ? "opposition" : "party";
        const opposition = oppositeAlliance(alliance);
        const debug = MODULE.isDebug;

        const origin =
            shape instanceof foundry.data.PolygonShapeData
                ? shape.origin
                : shape instanceof foundry.data.EmanationShapeData
                  ? { x: shape.base.x, y: shape.base.y }
                  : { x: shape.x, y: shape.y };

        if (debug) {
            canvas.controls.debug.clear();
        }

        const targets = [...region.tokens].filter((tokenDoc) => {
            if (self && !result.self && tokenDoc.object === self) return false;

            const token = tokenDoc.object;
            if (!token || tokenDoc.hidden) return false;

            const targetActor = tokenDoc.actor;
            if (!targetActor?.isOfType("creature", "hazard", "vehicle") || targetActor.isDead) return false;

            const targetAlliance = targetActor.alliance;
            if (targetAlliance === null && !result.neutral) return false;
            if (result.targets === "allies" && targetAlliance !== alliance) return false;
            if (result.targets === "enemies" && targetAlliance !== opposition) return false;

            return !lineIntersect(origin, token.center, debug);
        });

        const messageId = region.flags[SYSTEM.id].messageId;
        const targetsIds = targets.map((token) => token.id);
        const message = messageId && game.messages.get(messageId);

        canvas.tokens.setTargets(targetsIds);

        if (message) {
            const uuids = targets.map((token) => token.uuid);
            const updates = this.setMessageFlagTargets({}, uuids);
            message.update(updates);
        }

        returnAndDismiss();
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

        if (!updates.targets?.length && !this.getMessageTargets(message)) {
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
            this.settings.targets && (await renderAreaMessage.call(this, message, html, data));
        } else if (data.type === "check") {
            this.settings.checks && (await renderCheckMessage.call(this, message, html, data));
        } else if (data.type === "damage") {
            this.settings.targets && (await renderDamageMessage.call(this, message, html, data));
        } else if (data.type === "spell") {
            this.settings.targets && (await renderSpellMessage.call(this, message, html, data));
        }
    }
}

const targetHelperTool = new TargetHelperTool();

type ToolSettings = {
    checks: boolean;
    colorblind: boolean;
    dismissTemplate: boolean;
    enabled: boolean;
    expend: boolean;
    skipDice: boolean;
    small: boolean;
    targets: boolean;
    template: boolean;
};

type UpdateMessageDice = {
    id: string;
    data: Partial<DieData>;
    target: TokenDocumentUUID;
};

type TemplateDialogData = {
    dismiss: boolean;
    neutral: boolean;
    self: boolean;
    targets: "enemies" | "allies" | "all";
};

export { targetHelperTool };
export type { TargetHelperTool, UpdateMessageDice };
