import { TokenPF2e, positionTokenFromCoords } from "module-helpers";
import { createTool } from "../tool";

const TOKENS: TokenPF2e[] = [];

const { config, settings } = createTool({
    name: "teleport",
    settings: [
        {
            key: "enabled",
            type: Boolean,
            default: false,
            scope: "client",
            gmOnly: true,
        },
    ],
    keybinds: [
        {
            name: "teleport",
            restricted: true,
            onDown: () => {
                if (!settings.enabled) return;

                TOKENS.push(...canvas.tokens.controlled);

                if (TOKENS.length) {
                    canvas.stage.on("pointerdown", onCanvasStagePointerDown);
                }
            },
            onUp: () => {
                TOKENS.length = 0;
                canvas.stage.off("pointerdown", onCanvasStagePointerDown);
            },
        },
    ],
} as const);

async function onCanvasStagePointerDown(event: PIXI.FederatedPointerEvent) {
    const operation = { animate: false, bypass: true };
    const coords = event.getLocalPosition(canvas.app.stage);
    const updates: { _id: string; x: number; y: number }[] = TOKENS.map((token) => {
        const { x, y } = positionTokenFromCoords(coords, token);
        return { _id: token.id, x, y };
    });

    await canvas.scene?.updateEmbeddedDocuments("Token", updates, operation);
}

export { config as teleportTool };
