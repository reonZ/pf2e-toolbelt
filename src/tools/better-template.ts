import {
    createHook,
    isHoldingModifierKey,
    MeasuredTemplateDocumentPF2e,
    waitDialog,
} from "module-helpers";
import { getTemplateTokens, oppositeAlliance } from "module-helpers/src";
import { ModuleTool, ToolSettingsList } from "module-tool";

class BetterTemplateTool extends ModuleTool<ToolSettings> {
    #createMeasuredTemplateHook = createHook(
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
                key: "target.dismiss",
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
        if (user.id !== userId || !canvas.grid.isSquare || isHoldingModifierKey("Control")) return;

        const dismiss = this.settings["target.dismiss"];
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
                this.setSetting("target.dismiss", result.dismiss);
            }
            if (result.dismiss) {
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
            const actor = token.actor;

            if (
                token.document.hidden ||
                !actor?.isOfType("creature", "hazard", "vehicle") ||
                actor.isDead
            ) {
                return false;
            }

            if (self && token === self) {
                return result.self;
            }

            const targetAlliance = actor.alliance;

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
    "target.dismiss": boolean;
};

export { BetterTemplateTool };
