import {
    MeasuredTemplateDocumentPF2e,
    createFormData,
    getTemplateTokens,
    isHoldingModifierKeys,
} from "module-helpers";
import { createTool } from "../tool";

const { config, settings, hook, waitDialog } = createTool({
    name: "templateHelper",
    settings: [
        {
            key: "enabled",
            type: Boolean,
            default: false,
            scope: "client",
            onChange: (value) => {
                hook.toggle(value);
            },
        },
        {
            key: "dismiss",
            type: String,
            choices: ["disabled", "orphan", "all"],
            default: "disabled",
            scope: "client",
        },
    ],
    hooks: [
        {
            event: "createMeasuredTemplate",
            listener: onCreateMeasuredTemplate,
        },
    ],
    init: () => {
        hook.toggle(settings.enabled);
    },
} as const);

async function onCreateMeasuredTemplate(
    template: MeasuredTemplateDocumentPF2e,
    context: any,
    userId: string
) {
    const user = game.user;
    if (user.id !== userId || !canvas.grid.isSquare || isHoldingModifierKeys(["Control"])) return;

    const actor = template.actor;
    const self: Token | null | undefined = !actor
        ? undefined
        : actor.token?.object ?? actor.getActiveTokens()[0];

    const result = await waitDialog<{
        targets: "all" | "enemies" | "allies";
        self: boolean;
        neutral: boolean;
        event: PointerEvent | SubmitEvent;
    }>(
        "menu",
        {
            title: template.item?.name,
            yes: "fa-solid fa-bullseye-arrow",
            data: {
                noSelf: !self,
            },
            callback: async (event, btn, html) => {
                return {
                    ...createFormData(html),
                    event,
                };
            },
        },
        { width: 270, animation: false }
    );

    if (result) {
        const alliance = actor ? actor.alliance : user.isGM ? "opposition" : "party";
        const opposition =
            alliance === "party" ? "opposition" : alliance === "opposition" ? "party" : null;

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

            if (self && token === self) return result.self;

            const targetAlliance = actor.alliance;
            if (targetAlliance === null) return result.neutral;

            return (
                result.targets === "all" ||
                (result.targets === "allies" && targetAlliance === alliance) ||
                (result.targets === "enemies" && targetAlliance === opposition)
            );
        });

        const targetsIds = targets
            .map((token) => token.id)
            .concat("shiftKey" in result.event && result.event.shiftKey ? user.targets.ids : []);

        user.updateTokenTargets(targetsIds);
        user.broadcastActivity({ targets: targetsIds });
    }

    const dismissSetting = settings.dismiss;
    if (dismissSetting === "disabled") return;

    const message = template.message;
    if (!message || dismissSetting === "all") {
        template.delete();
        return;
    }

    if (
        message.getFlag("pf2e", "context.type") === "spell-cast" ||
        message.getFlag("pf2e", "origin.type") === "spell"
    )
        return;

    template.delete();
}

export { config as templateHelperTool };
