import { TokenPF2e } from "foundry-helpers";

const RECT_CORNERS = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
];

const RECT_SPREAD = [
    { x: 0.25, y: 0.25 },
    { x: 0.75, y: 0.25 },
    { x: 0.25, y: 0.75 },
    { x: 0.75, y: 0.75 },
];

function getRectPoint(point: Point, rect: Rectangle): Point {
    return { x: rect.x + rect.width * point.x, y: rect.y + rect.height * point.y };
}

function getRectEdges(rect: Rectangle, margin: number): RectEdges {
    const opposite = 1 - margin;
    return {
        top: {
            A: getRectPoint({ x: margin, y: margin }, rect),
            B: getRectPoint({ x: opposite, y: margin }, rect),
        },
        right: {
            A: getRectPoint({ x: opposite, y: margin }, rect),
            B: getRectPoint({ x: opposite, y: opposite }, rect),
        },
        bottom: {
            A: getRectPoint({ x: opposite, y: opposite }, rect),
            B: getRectPoint({ x: margin, y: opposite }, rect),
        },
        left: {
            A: getRectPoint({ x: margin, y: opposite }, rect),
            B: getRectPoint({ x: margin, y: margin }, rect),
        },
    };
}

function* tokenSpread(token: TokenPF2e, type: "spread" | "corner"): Generator<Point, void, unknown> {
    const rect = token.bounds;
    const spread = type === "spread" ? RECT_SPREAD : RECT_CORNERS;

    for (const point of spread) {
        yield getRectPoint(point, rect);
    }
}

function tokenToSpread(origin: TokenPF2e, target: TokenPF2e, type: "spread" | "corner", debug: boolean): boolean {
    const originCenter = origin.center;

    for (const point of tokenSpread(target, type)) {
        if (lineIntersect(originCenter, point, debug)) return true;
    }

    return false;
}

function spreadToToken(origin: TokenPF2e, type: "spread" | "corner", target: TokenPF2e, debug: boolean): boolean {
    const targetCenter = target.center;

    for (const point of tokenSpread(origin, type)) {
        if (!lineIntersect(point, targetCenter, debug)) {
            return false;
        }
    }

    return true;
}

// function spreadToSpread(
//     origin: TokenPF2e,
//     originType: "spread" | "corner",
//     target: TokenPF2e,
//     targetType: "spread" | "corner",
//     debug: boolean,
// ): boolean {
//     for (const originPoint of tokenSpread(origin, originType)) {
//         for (const targetPoint of tokenSpread(target, targetType)) {
//             if (lineIntersect(originPoint, targetPoint, debug)) return true;
//         }
//     }

//     return false;
// }

function lineIntersect(origin: Point, target: Point, debug: boolean): boolean {
    const intersects = CONFIG.Canvas.polygonBackends.move.testCollision(origin, target, { type: "move", mode: "any" });

    if (debug) {
        drawDebugLine(origin, target, intersects ? "red" : "green");
    }

    return intersects;
}

function drawDebugLine(origin: Point, target: Point, color: "blue" | "green" | "red") {
    const hex = color === "blue" ? 0x0066cc : color === "red" ? 0xff0000 : 0x16a103;
    canvas.controls.debug.lineStyle(4, hex).moveTo(origin.x, origin.y).lineTo(target.x, target.y);
}

type RectEdge = { A: Point; B: Point };
type RectEdges = Record<"top" | "right" | "bottom" | "left", RectEdge>;

export { drawDebugLine, getRectEdges, lineIntersect, spreadToToken, tokenToSpread };
export type { RectEdge, RectEdges };
