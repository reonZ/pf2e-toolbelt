import { MODULE, TokenDocumentPF2e, TokenPF2e } from "foundry-helpers";
import { lineIntersect, Vector } from "tools";

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

////////////////

const EPSILON = 0.0000001;

const CORNER_SPREADS = [
    [0, 0, 0], // floorTopLeft
    [1, 1, 1], // ceilBottomRight
    [1, 0, 0], // floorTopRight
    [0, 1, 1], // ceilBottomLeft
    [1, 1, 0], // floorBottomRight
    [0, 0, 1], // ceilTopLeft
    [0, 1, 0], // floorBottomLeft
    [1, 0, 1], // ceilTopRight
] as const;

function getSideOfPointFromLine(v0: Point, v1: Point, p: Point): -1 | 0 | 1 {
    const d = (v1.x - v0.x) * (p.y - v0.y) - (v1.y - v0.y) * (p.x - v0.x);
    return d > 0 ? 1 : d < 0 ? -1 : 0;
}

function getTokenDepth(token: TokenDocumentPF2e): number {
    const actor = token.actor;

    if (actor?.isOfType("vehicle")) {
        return actor.system.details.space.high;
    }

    if (actor?.isOfType("creature") && token.width === token.height) {
        return token.width;
    }

    // not really sure what to do here in case of non squared bounds
    return Math.min(token.width, token.height);
}

function* tokenSpreadValues(token: TokenDocumentPF2e, value: number): Generator<Vector, void, unknown> {
    const { distance, size } = token.scene?.grid ?? { distance: 5, size: 100 };
    const elevation = (token.elevation / distance) * size;
    const depth = getTokenDepth(token) * size;
    const height = token.height * size;
    const width = token.width * size;
    const center = new Vector(token.x + width / 2, token.y + height / 2, elevation + depth / 2);
    const origin = Vector.fromData(token, elevation);

    if (value <= 0) {
        yield center;
        return; // we only use the center point
    }

    // the expected value is between [0, 0.5], so we need to double it to work with center
    const scalar = Math.clamp(value, 0, 0.5) * 2;

    for (const [x, y, z] of CORNER_SPREADS) {
        const p = origin.add({ x: width * x, y: height * y, z: depth * z });
        yield scalar === 0.5 ? p : center.moveTowardByScalar(p, scalar);
    }
}

function* spreadValuesGenerator(
    originToken: TokenDocumentPF2e,
    targetToken: TokenDocumentPF2e,
    originSpread: number,
    targetSpread: number,
): SpreadValuesGenerator {
    for (const origin of tokenSpreadValues(originToken, originSpread)) {
        for (const target of tokenSpreadValues(targetToken, targetSpread)) {
            yield [origin, target, target.subtract(origin)] as const;
        }
    }
}

// Möller–Trumbore implementation
function lineIntersectTriangle(P: Vector, D: Vector, v0: Vector, v1: Vector, v2: Vector): Vector | undefined {
    const e1 = v1.subtract(v0);
    const e2 = v2.subtract(v0);
    const N = D.cross(e2);
    const denom = e1.dot(N);

    // line is parallel to plane
    if (Math.abs(denom) < EPSILON) return;

    const invDenom = 1 / denom;
    const w0 = P.subtract(v0);
    const u = w0.dot(N) * invDenom;

    // line passes outside of e2 bounds
    if (u < 0 || u > 1) return;

    const q = w0.cross(e1);
    const v = D.dot(q) * invDenom;

    // line passes outside of e1 bounds
    if (v < 0 || u + v > 1.0) return;

    // line intersection
    const t = e2.dot(q) * invDenom;

    // our finite line intersects the triangle
    if (t > EPSILON) {
        return D.multiplyBy(t).add(P);
    }
}

MODULE.debugExpose("geometry", {
    getSideOfPointFromLine,
    getTokenDepth,
    lineIntersectTriangle,
    spreadValuesGenerator,
    tokenSpreadValues,
    Vector,
});

type RectEdge = { A: Point; B: Point };
type RectEdges = Record<"top" | "right" | "bottom" | "left", RectEdge>;

type SpreadValuesGenerator = Generator<readonly [origin: Vector, target: Vector, direction: Vector], void, unknown>;

export {
    getRectEdges,
    getSideOfPointFromLine,
    lineIntersectTriangle,
    spreadToToken,
    spreadValuesGenerator,
    tokenToSpread,
};
export type { RectEdge, RectEdges, SpreadValuesGenerator };
