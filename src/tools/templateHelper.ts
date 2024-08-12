import { getTemplateTokens, htmlQuery, isHoldingModifierKeys } from "foundry-pf2e";
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

    const html = await waitDialog(
        "menu",
        {
            title: template.item?.name,
            yes: "fa-solid fa-bullseye-arrow",
            data: {
                noSelf: !self,
            },
        },
        { width: 300 }
    );

    if (html) {
        const target = htmlQuery<HTMLInputElement>(html, "[name='targets']:checked")?.value;
        const targetNeutral = htmlQuery<HTMLInputElement>(html, "[name='neutral']")?.checked;
        const targetSelf = htmlQuery<HTMLInputElement>(html, "[name='self']")?.checked;
        const alliance = actor ? actor.alliance : user.isGM ? "opposition" : "party";
        const opposition =
            alliance === "party" ? "opposition" : alliance === "opposition" ? "party" : null;

        const tokens = getTemplateTokens(template);
        const targets = tokens.filter((token) => {
            const actor = token.actor;
            if (token.document.hidden || !actor?.isOfType("creature", "hazard", "vehicle")) {
                return false;
            }

            if (self && token === self) return targetSelf;

            const targetAlliance = actor.alliance;
            if (targetAlliance === null) return targetNeutral;

            return (
                target === "all" ||
                (target === "allies" && targetAlliance === alliance) ||
                (target === "enemies" && targetAlliance === opposition)
            );
        });

        const targetsIds = targets.map((token) => token.id);
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
