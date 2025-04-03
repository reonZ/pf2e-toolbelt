import { R, TokenPF2e, positionTokenFromCoords } from "module-helpers";
import { createTool } from "../tool";

const TOKENS: TokenPF2e[] = [];

const innerSpread: PointSpread[] = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
];

const outerSpread: PointSpread[] = [
    [-2, -2],
    [-1, -2],
    [0, -2],
    [1, -2],
    [2, -2],
    [2, -1],
    [2, 0],
    [2, 1],
    [2, 2],
    [1, 2],
    [0, 2],
    [-1, 2],
    [-2, 2],
    [-2, 1],
    [-2, 0],
    [-2, -1],
];

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
                activeTeleport(false);
            },
            onUp: () => {
                disableTeleport();
            },
        },
        {
            name: "unselect",
            restricted: true,
            onDown: () => {
                activeTeleport(true);
            },
            onUp: () => {
                disableTeleport();
            },
        },
    ],
} as const);

function activeTeleport(unselect: boolean) {
    if (!settings.enabled) return;

    TOKENS.push(...canvas.tokens.controlled);

    if (unselect) {
        canvas.tokens.releaseAll();
    }

    if (TOKENS.length) {
        canvas.stage.on("pointerdown", onCanvasStagePointerDown);
    }
}

function disableTeleport() {
    TOKENS.length = 0;
    canvas.stage.off("pointerdown", onCanvasStagePointerDown);
}

async function onCanvasStagePointerDown(event: PIXI.FederatedPointerEvent) {
    const operation = { animate: false, bypass: true };
    const updates = event.button !== 2 ? spreadTokens(event) : groupTokens(event);

    await canvas.scene?.updateEmbeddedDocuments("Token", updates, operation);

    disableTeleport();

    if (event.button !== 0) {
        canvas.tokens.releaseAll();
    }
}

function spreadTokens(event: PIXI.FederatedPointerEvent): PositionUpdate[] {
    const updates: PositionUpdate[] = [];

    const [largeTokens, tokens] = R.partition(TOKENS, (token) => token.document.width > 1);
    const hasLargeToken = largeTokens.length > 1;

    const gridSize = canvas.grid.size;
    const localPosition = event.getLocalPosition(canvas.app.stage);
    const origin = canvas.grid.getSnappedPoint(localPosition, {
        mode: CONST.GRID_SNAPPING_MODES.CENTER,
    });

    const spreads: { raw: PointSpread; coords?: Point | false }[] = (
        hasLargeToken ? [...outerSpread, ...innerSpread] : [...innerSpread, ...outerSpread]
    ).map((raw) => ({ raw }));

    if (hasLargeToken) {
        for (const token of largeTokens) {
            const { x, y } = positionTokenFromCoords(origin, token);
            updates.push({ _id: token.id, x, y });
        }
        spreads.push({ raw: [0, 0], coords: localPosition });
    } else {
        spreads.unshift({ raw: [0, 0], coords: localPosition });
    }

    let spreadIndex = -1;

    const addUpdate = (token: TokenPF2e): boolean => {
        spreadIndex = spreadIndex + 1 >= spreads.length ? 0 : spreadIndex + 1;
        const spread = spreads[spreadIndex];

        if (spread.coords === undefined) {
            const offsetX = spread.raw[0] * gridSize;
            const offsetY = spread.raw[1] * gridSize;

            const target = {
                x: origin.x + offsetX,
                y: origin.y + offsetY,
            };

            const intersects = CONFIG.Canvas.polygonBackends.move.testCollision(origin, target, {
                type: "move",
                mode: "any",
            });

            spread.coords = intersects
                ? false
                : {
                      x: localPosition.x + offsetX,
                      y: localPosition.y + offsetY,
                  };
        }

        if (!spread.coords) return false;

        const { x, y } = positionTokenFromCoords(spread.coords, token);
        updates.push({ _id: token.id, x, y });

        return true;
    };

    for (const token of tokens) {
        while (!addUpdate(token)) {}
    }

    return updates;
}

function groupTokens(event: PIXI.FederatedPointerEvent): PositionUpdate[] {
    const position = event.getLocalPosition(canvas.app.stage);

    return TOKENS.map((token) => {
        const { x, y } = positionTokenFromCoords(position, token);
        return { _id: token.id, x, y };
    });
}

type PointSpread = [number, number];
type PositionUpdate = { _id: string; x: number; y: number };

export { config as teleportTool };
