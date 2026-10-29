import { MODULE, TokenDocumentPF2e } from "foundry-helpers";
import { Vector } from "tools";

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

function createBoundaryFromTokens(origin: TokenDocumentPF2e, target: TokenDocumentPF2e): PIXI.Rectangle {
    const size = origin.scene?.grid.size ?? 100;
    const boundaryWidth = target.x + target.width * size - origin.x;
    const boundaryHeight = target.y + target.height * size - origin.y;
    return new PIXI.Rectangle(origin.x, origin.y, boundaryWidth, boundaryHeight);
}

function tokenSides(token: TokenDocumentPF2e, sideScale: number) {}

function tokenSpreadValues(token: TokenDocumentPF2e, value: number): Vector[] {
    const { distance, size } = token.scene?.grid ?? { distance: 5, size: 100 };
    const elevation = (token.elevation / distance) * size;
    const depth = getTokenDepth(token) * size;
    const height = token.height * size;
    const width = token.width * size;
    const center = new Vector(token.x + width / 2, token.y + height / 2, elevation + depth / 2);
    const origin = Vector.fromData(token, elevation);

    if (value <= 0) {
        return [center]; // we only use the center point
    }

    // the expected value is between [0, 0.5], so we need to double it to work with center
    const scalar = Math.clamp(value, 0, 0.5) * 2;

    return CORNER_SPREADS.map(([x, y, z]) => {
        const p = origin.add({ x: width * x, y: height * y, z: depth * z });
        return scalar === 0.5 ? p : center.moveTowardByScalar(p, scalar);
    });
}

function generateSpreadRays(
    origin: TokenDocumentPF2e,
    target: TokenDocumentPF2e,
    originSpread: number,
    targetSpread: number,
): GeneratedSpreadRays {
    const originSpreads = tokenSpreadValues(origin, originSpread);
    const targetSpreads = tokenSpreadValues(target, targetSpread);
    return originSpreads.flatMap((origin) => {
        return targetSpreads.map((target) => {
            return [origin, target, target.subtract(origin)] as const;
        });
    });
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
    generateSpreadRays,
    tokenSpreadValues,
    Vector,
});

type RectEdge = { A: Point; B: Point };
type RectEdges = Record<"top" | "right" | "bottom" | "left", RectEdge>;

type GeneratedSpreadRays = (readonly [origin: Vector, target: Vector, direction: Vector])[];

export { createBoundaryFromTokens, generateSpreadRays, getSideOfPointFromLine, lineIntersectTriangle };
export type { GeneratedSpreadRays, RectEdge, RectEdges };
