import {
    createToggleKeybind,
    createToggleWrapper,
    KeybindingActionConfig,
    MODULE,
    positionTokenFromCoords,
    R,
    selectTokens,
} from "foundry-helpers";
import { TokenPF2e } from "foundry-pf2e";
import { ModuleTool, ToolSettingsList } from "module-tool";

const TELEPORT_SETTING = ["disabled", "enabled", "select"] as const;

class BetterMovementTool extends ModuleTool<ToolSettings> {
    #cancelTeleport: (() => void) | null = null;

    #shouldRecordMovementHistoryWrapper = createToggleWrapper(
        "OVERRIDE",
        "CONFIG.Token.documentClass.prototype._shouldRecordMovementHistory",
        this.#shouldRecordMovementHistory,
        { context: this },
    );

    #teleportKeybind = createToggleKeybind({
        name: "teleport",
        restricted: true,
        onDown: () => {
            this.#activeTeleport(false);
        },
        onUp: () => {
            this.#disableTeleport();
        },
    });

    #unselectKeybind = createToggleKeybind({
        name: "unselect",
        restricted: true,
        onDown: () => {
            this.#activeTeleport(true);
        },
        onUp: () => {
            this.#disableTeleport();
        },
    });

    static SPREADS: SpreadPoint[] = [
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

    static INNER_ORTHOS: SpreadPoint[] = [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
    ];

    static OUTER_ORTHOS: SpreadPoint[] = [
        [0, -2],
        [0, 2],
        [-2, 0],
        [2, 0],
    ];

    get key(): "betterMovement" {
        return "betterMovement";
    }

    get settingsSchema(): ToolSettingsList<ToolSettings> {
        return [
            {
                key: "teleport",
                type: String,
                default: "disabled",
                choices: TELEPORT_SETTING,
                scope: "user",
                gmOnly: true,
                onChange: (value: ToolSettings["teleport"]) => {
                    const enabled = value !== "disabled";
                    this.#teleportKeybind.toggle(enabled);
                    this.#unselectKeybind.toggle(enabled);
                },
            },
            {
                key: "history",
                type: Boolean,
                default: false,
                scope: "user",
                onChange: (value) => {
                    this.#shouldRecordMovementHistoryWrapper.toggle(value);
                },
            },
        ];
    }

    get keybindsSchema(): KeybindingActionConfig[] {
        return [
            this.#teleportKeybind.configs, //
            this.#unselectKeybind.configs,
        ];
    }

    init(isGM: boolean): void {
        if (isGM && this.settings.teleport !== "disabled") {
            this.#teleportKeybind.activate();
            this.#unselectKeybind.activate();
        }

        if (this.settings.history) {
            this.#shouldRecordMovementHistoryWrapper.activate();
        }
    }

    #shouldRecordMovementHistory(_token: TokenPF2e) {
        return false;
    }

    #activeTeleport(unselect: boolean) {
        const tokens = canvas.tokens.controlled;

        if (unselect) {
            canvas.tokens.releaseAll();
        }

        if (tokens.length) {
            const listener = async (event: PIXI.FederatedPointerEvent) => {
                await this.#onCanvasStagePointerDown(event, tokens);
                this.#cancelTeleport?.();
            };

            canvas.stage.on("pointerdown", listener);

            this.#cancelTeleport = () => {
                canvas.stage.off("pointerdown", listener);
            };
        }
    }

    #disableTeleport() {
        this.#cancelTeleport?.();
        this.#cancelTeleport = null;
    }

    async #onCanvasStagePointerDown(event: PIXI.FederatedPointerEvent, tokens: TokenPF2e[]) {
        const operation: TokenOperation = {
            animate: false,
            history: false,
            diff: false,
            movement: {},
        };

        const updates = event.button !== 2 ? this.#spreadTokens(event, tokens) : this.#groupTokens(event, tokens);

        for (const { _id } of updates) {
            operation.movement[_id] = {
                autoRotate: false,
                constrainOptions: { ignoreWalls: true, ignoreCost: true },
                method: "api",
                showRuler: false,
            };
        }

        await canvas.scene?.updateEmbeddedDocuments("Token", updates, operation);

        if (this.settings.teleport === "select") {
            selectTokens(tokens);
        } else if (event.button !== 0) {
            canvas.tokens.releaseAll();
        }
    }

    #spreadTokens(event: PIXI.FederatedPointerEvent, tokens: TokenPF2e[]): PositionUpdate[] {
        const updates: PositionUpdate[] = [];

        const [largeTokens, otherTokens] = R.partition(tokens, (token) => token.document.width > 1);
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

        const testCollision = (targetSpread: SpreadPoint, originSpread: SpreadPoint = [0, 0]): boolean => {
            const origin = getOffsetPosition(originSpread);
            const target = getOffsetPosition(targetSpread);

            const intersects = CONFIG.Canvas.polygonBackends.move.testCollision(origin, target, {
                type: "move",
                mode: "any",
            });

            if (!intersects && MODULE.isDebug) {
                canvas.controls.debug.lineStyle(4, 0x16a103).moveTo(origin.x, origin.y).lineTo(target.x, target.y);
            }

            return intersects;
        };

        const getSpreadKey = ([x, y]: SpreadPoint): SpreadKey => {
            return `${x}x${y}`;
        };

        const origins: SpreadPoint[] = [[0, 0]];
        const originKeys: SpreadKey[] = ["0x0"];

        if (MODULE.isDebug) {
            canvas.controls.debug.clear();
        }

        // we test for collision against ortho squares to later use them as origin too
        for (let i = 0; i < BetterMovementTool.OUTER_ORTHOS.length; i++) {
            const outerSpread = BetterMovementTool.OUTER_ORTHOS[i];
            const innerSpread = BetterMovementTool.INNER_ORTHOS[i];

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
            spreadIndex = spreadIndex + 1 >= BetterMovementTool.SPREADS.length ? 0 : spreadIndex + 1;

            const spread = BetterMovementTool.SPREADS[spreadIndex];
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

        for (const token of otherTokens) {
            while (!addUpdate(token)) {}
        }

        return updates;
    }

    #groupTokens(event: PIXI.FederatedPointerEvent, tokens: TokenPF2e[]): PositionUpdate[] {
        const position = event.getLocalPosition(canvas.app.stage);

        return tokens.map((token): PositionUpdate => {
            const { x, y } = positionTokenFromCoords(position, token);
            return { _id: token.id, x, y };
        });
    }
}

type SpreadPoint = [number, number];
type SpreadKey = `${number}x${number}`;

type PositionUpdate = {
    _id: string;
    x: number;
    y: number;
    sort?: number;
};

type ToolSettings = {
    teleport: (typeof TELEPORT_SETTING)[number];
    history: boolean;
};

type TokenOperation = {
    animate: boolean;
    history: boolean;
    diff: boolean;
    movement: Record<
        string,
        {
            autoRotate: boolean;
            constrainOptions: { ignoreWalls: true; ignoreCost: true };
            method: "api";
            showRuler: boolean;
        }
    >;
};

export { BetterMovementTool };
