import {
    createToggleableHook,
    getTemplateTokens,
    isHoldingModifierKey,
    MeasuredTemplateDocumentPF2e,
    oppositeAlliance,
    waitDialog,
} from "module-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";

class BetterTemplateTool extends ModuleTool<ToolSettings> {
    #createMeasuredTemplateHook = createToggleableHook(
        "createMeasuredTemplate",
        this.#onCreateMeasuredTemplate.bind(this)
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

    init(isGM: boolean): void {
        this.#createMeasuredTemplateHook.toggle(this.settings.target);
    }

    async #onCreateMeasuredTemplate(
        template: MeasuredTemplateDocumentPF2e,
        context: any,
        userId: string
    ) {
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
        const self: Token | null | undefined = !actor
            ? undefined
            : actor.token?.object ?? actor.getActiveTokens()[0];

        const result = await waitDialog<
            {
                dismiss: boolean;
                neutral: boolean;
                self: boolean;
                targets: "enemies" | "allies" | "all";
            },
            "dismiss"
        >({
            content: `${this.key}/target`,
            i18n: `${this.key}.target`,
            title: template.item?.name,
            classes: [`${this.key}-target`],
            data: {
                noSelf: !self,
                dismiss,
            },
            minWidth: "",
            position: {
                left: 200,
            },
            returnOnFalse: ["dismiss"],
            skipAnimate: true,
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

        const targetsIds = targets.map((token) => token.id);
        canvas.tokens.setTargets(targetsIds);
        returnAndDismiss();
    }
}

type ToolSettings = {
    target: boolean;
    targetDismiss: boolean;
};

export { BetterTemplateTool };
