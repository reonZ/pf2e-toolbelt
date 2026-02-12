import {
    getTemplateTokens,
    isHoldingModifierKey,
    oppositeAlliance,
    SYSTEM,
    ToggleableHook,
    Token,
    waitDialog,
} from "foundry-helpers";
import { MeasuredTemplateDocumentPF2e } from "foundry-pf2e";
import { ModuleTool, ToolSettingsList } from "module-tool";
import { TargetHelperTool } from "./target-helper";

export class BetterTemplateTool extends ModuleTool<ToolSettings> {
    #createMeasuredTemplateHook = new ToggleableHook(
        "createMeasuredTemplate",
        this.#onCreateMeasuredTemplate.bind(this),
    );

    get key(): "betterTemplate" {
        return "betterTemplate";
    }

    get settingsSchema(): ToolSettingsList<ToolSettings> {
        return [
            {
                key: "target",
                type: Boolean,
                default: false,
                scope: "user",
                onChange: (value) => {
                    this.#createMeasuredTemplateHook.toggle(value);
                },
            },
            {
                key: "targetDismiss",
                type: Boolean,
                default: true,
                scope: "user",
                config: false,
            },
        ];
    }

    init(): void {
        this.#createMeasuredTemplateHook.toggle(this.settings.target);
    }

    async #onCreateMeasuredTemplate(template: MeasuredTemplateDocumentPF2e, _context: any, userId: string) {
        const user = game.user;

        if (
            user.id !== userId ||
            !canvas.grid.isSquare ||
            isHoldingModifierKey("Control") ||
            this.getFlag(template, "skip")
        )
            return;

        const dismiss = this.settings.targetDismiss;
        const actor = template.actor;
        const self: Token | null | undefined = !actor ? undefined : (actor.token?.object ?? actor.getActiveTokens()[0]);

        const result = await waitDialog({
            content: `${this.key}/target`,
            i18n: `${this.key}.target`,
            title: template.item?.name,
            classes: [`${this.key}-target`],
            data: {
                noSelf: !self,
                dismiss,
            },
        });

        if (!result) return;

        const returnAndDismiss = () => {
            if (dismiss !== result.dismiss) {
                this.settings.targetDismiss = result.dismiss;
            }
            if (result.dismiss && template.rendered) {
                template.delete();
            }
            return;
        };

        if (!("targets" in result)) {
            return returnAndDismiss();
        }

        const alliance = actor ? actor.alliance : user.isGM ? "opposition" : "party";
        const opposition = oppositeAlliance(alliance);
        const tokens = getTemplateTokens(template);

        const targets = tokens.filter((token) => {
            const targetActor = token.actor;

            if (
                token.document.hidden ||
                !targetActor?.isOfType("creature", "hazard", "vehicle") ||
                targetActor.isDead
            ) {
                return false;
            }

            if (self && token === self) {
                return result.self;
            }

            const targetAlliance = targetActor.alliance;

            if (targetAlliance === null) {
                return result.neutral;
            }

            return (
                result.targets === "all" ||
                (result.targets === "allies" && targetAlliance === alliance) ||
                (result.targets === "enemies" && targetAlliance === opposition)
            );
        });

        const messageId = template.flags[SYSTEM.id].messageId;
        const targetsIds = targets.map((token) => token.id);
        const message = messageId && game.messages.get(messageId);

        canvas.tokens.setTargets(targetsIds);

        const targetHelper = MAPPED_TOOLS.targetHelper as TargetHelperTool;
        if (message && targetHelper.settings.enabled) {
            const updates = targetHelper.setMessageFlagTargets(
                {},
                targets.map((token) => token.document.uuid),
            );

            if (updates) {
                message.update(updates);
            }
        }

        returnAndDismiss();
    }
}

type ToolSettings = {
    target: boolean;
    targetDismiss: boolean;
};
