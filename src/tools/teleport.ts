import { MODULE, R, TokenPF2e, positionTokenFromCoords } from "module-helpers";
import { createTool } from "../tool";

const TOKENS: TokenPF2e[] = [];

const SPREADS: SpreadPoint[] = [
    [0, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
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

const INNER_ORTHOS: SpreadPoint[] = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
];

const OUTER_ORTHOS: SpreadPoint[] = [
    [0, -2],
    [0, 2],
    [-2, 0],
    [2, 0],
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
        {
            key: "select",
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

    if (settings.select) {
        canvas.tokens.releaseAll();

        for (const token of TOKENS) {
            token.control({ releaseOthers: false });
        }
    } else if (event.button !== 0) {
        canvas.tokens.releaseAll();
    }

    disableTeleport();
}

function spreadTokens(event: PIXI.FederatedPointerEvent): PositionUpdate[] {
    const updates: PositionUpdate[] = [];

    const [largeTokens, tokens] = R.partition(TOKENS, (token) => token.document.width > 1);
    const hasLargeToken = largeTokens.length > 0;

    const gridSize = canvas.grid.size;
    const localPosition = event.getLocalPosition(canvas.app.stage);
    const clickPosition = canvas.grid.getSnappedPoint(localPosition, {
        mode: CONST.GRID_SNAPPING_MODES.CENTER,
    });

    if (hasLargeToken) {
        const sortedLargeTokens = R.sortBy(largeTokens, [(token) => token.document.width, "desc"]);

        for (let i = 0; i < sortedLargeTokens.length; i++) {
            const token = sortedLargeTokens[i];
            const { x, y } = positionTokenFromCoords(clickPosition, token, false);

            updates.push({ _id: token.id, x, y, sort: i });
        }
    }

    const getOffsetPosition = (spread: SpreadPoint): Point => {
        return {
            x: clickPosition.x + spread[0] * gridSize,
            y: clickPosition.y + spread[1] * gridSize,
        };
    };

    const testCollision = (
        targetSpread: SpreadPoint,
        originSpread: SpreadPoint = [0, 0]
    ): boolean => {
        const origin = getOffsetPosition(originSpread);
        const target = getOffsetPosition(targetSpread);

        const intersects = CONFIG.Canvas.polygonBackends.move.testCollision(origin, target, {
            type: "move",
            mode: "any",
        });

        if (!intersects && MODULE.isDebug) {
            canvas.controls.debug
                .lineStyle(4, 0x16a103)
                .moveTo(origin.x, origin.y)
                .lineTo(target.x, target.y);
        }

        return intersects;
    };

    const getSpreadKey = ([x, y]: SpreadPoint): SpreadKey => {
        return `${x}x${y}`;
    };

    const origins: SpreadPoint[] = [[0, 0]];
    const originKeys: SpreadKey[] = ["0x0"];

    // we test for collision against ortho squares to later use them as origin too
    for (let i = 0; i < OUTER_ORTHOS.length; i++) {
        const outerSpread = OUTER_ORTHOS[i];
        const innerSpread = INNER_ORTHOS[i];

        if (!testCollision(outerSpread)) {
            origins.push(outerSpread);
            origins.push(innerSpread);
            originKeys.push(getSpreadKey(outerSpread));
            originKeys.push(getSpreadKey(innerSpread));
        } else if (!testCollision(innerSpread)) {
            origins.push(innerSpread);
            originKeys.push(getSpreadKey(innerSpread));
        }
    }

    let spreadIndex = -1;

    const spreadMap: Record<SpreadKey, Point | false> = {};

    const addUpdate = (token: TokenPF2e): boolean => {
        spreadIndex = spreadIndex + 1 >= SPREADS.length ? 0 : spreadIndex + 1;

        const spread = SPREADS[spreadIndex];
        const spreadKey = getSpreadKey(spread);

        test: if (spreadMap[spreadKey] === undefined) {
            if (originKeys.includes(spreadKey)) {
                spreadMap[spreadKey] = getOffsetPosition(spread);
                break test;
            }

            for (const origin of origins) {
                if (!testCollision(spread, origin)) {
                    spreadMap[spreadKey] = getOffsetPosition(spread);
                    break test;
                }
            }

            spreadMap[spreadKey] = false;
        }

        const coords = spreadMap[spreadKey];
        if (!coords) return false;

        const { x, y } = positionTokenFromCoords(coords, token);
        const update: PositionUpdate = { _id: token.id, x, y };

        if (hasLargeToken) {
            update.sort = largeTokens.length;
        }

        if (token.document.width < 1) {
            update.sort = (update.sort ?? 0) + 1;
        }

        updates.push(update);

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

type SpreadPoint = [number, number];
type SpreadKey = `${number}x${number}`;

type PositionUpdate = {
    _id: string;
    x: number;
    y: number;
    sort?: number;
};

export { config as teleportTool };
