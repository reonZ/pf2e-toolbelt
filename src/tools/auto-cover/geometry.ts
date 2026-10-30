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

    const originLeft = Math.round(origin.x);
    const originTop = Math.round(origin.y);
    const originRight = originLeft + origin.width * size;
    const originBottom = originTop + origin.height * size;
    const targetLeft = Math.round(target.x);
    const targetTop = Math.round(target.y);
    const targetRight = targetLeft + target.width * size;
    const targetBottom = targetTop + target.height * size;

    const left = targetLeft < originLeft ? targetLeft : originLeft;
    const right = originRight > targetRight ? originRight : targetRight;
    const top = targetTop < originTop ? targetTop : originTop;
    const bottom = originBottom > targetBottom ? originBottom : targetBottom;

    const width = right - left;
    const height = bottom - top;

    return new PIXI.Rectangle(left, top, width, height).normalize();
}

function tokenSides(token: TokenDocumentPF2e, sideScale: number) {}

function createTokenSpreadGenerator(token: TokenDocumentPF2e, value: number): TokenSpreadGenerator {
    const { distance, size } = token.scene?.grid ?? { distance: 5, size: 100 };
    const elevation = (token.elevation / distance) * size;
    const depth = getTokenDepth(token) * size;
    const height = token.height * size;
    const width = token.width * size;
    const center = new Vector(token.x + width / 2, token.y + height / 2, elevation + depth / 2);
    const origin = Vector.fromData(token, elevation);
    // the expected value is between [0, 0.5], so we need to double it to work with [0, 1]
    const scalar = Math.clamp(value, 0, 0.5) * 2;
    // we cache the results that have been generated on the last generator call
    const cached: Vector[] = [];

    const project = ([x, y, z]: (typeof CORNER_SPREADS)[number]): Vector => {
        const p = origin.add({ x: width * x, y: height * y, z: depth * z });
        return scalar === 1 ? p : center.moveTowardByScalar(p, scalar);
    };

    function* tokenSpreadGenerator(): Generator<Vector, void, unknown> {
        if (scalar === 0) {
            yield center; // we only use the center point
            return;
        }

        for (let i = 0; i < CORNER_SPREADS.length; i++) {
            yield (cached[i] ??= project(CORNER_SPREADS[i]));
        }
    }

    Object.defineProperties(tokenSpreadGenerator, {
        depth: {
            get(): number {
                return depth;
            },
            enumerable: false,
            configurable: false,
        },
        elevation: {
            get(): number {
                return elevation;
            },
            enumerable: false,
            configurable: false,
        },
        eliminate: {
            get(): boolean {
                return scalar > 0;
            },
            enumerable: false,
            configurable: false,
        },
    });

    return tokenSpreadGenerator as TokenSpreadGenerator;
}

function createSpreadRaysGenerator(
    origin: TokenDocumentPF2e,
    target: TokenDocumentPF2e,
    originSpread: number,
    targetSpread: number,
): SpreadRaysGenerator {
    const originSpreads = createTokenSpreadGenerator(origin, originSpread);
    const targetSpreads = createTokenSpreadGenerator(target, targetSpread);
    const minZ = Math.min(originSpreads.elevation, targetSpreads.elevation);
    const maxZ = Math.max(originSpreads.elevation + originSpreads.depth, targetSpreads.elevation + targetSpreads.depth);
    // we cache the results that have been generated on the last generator call
    const cached: GeneratedSpreadRay[][] = [];

    const merge = (O: Vector, T: Vector): GeneratedSpreadRay => {
        return [O, T, T.subtract(O)];
    };

    function* spreadRaysGenerator(): Generator<GeneratedSpreadRay, void, unknown> {
        let i = 0;
        let j = 0;

        for (const origin of originSpreads()) {
            for (const target of targetSpreads()) {
                const _cached = (cached[i] ??= []);
                yield (_cached[j] ??= merge(origin, target));
                j++;
            }
            i++;
        }
    }

    Object.defineProperties(spreadRaysGenerator, {
        eliminate: {
            get(): boolean {
                return originSpreads.eliminate || targetSpreads.eliminate;
            },
            enumerable: false,
            configurable: false,
        },
        minZ: {
            get(): number {
                return minZ;
            },
            enumerable: false,
            configurable: false,
        },
        maxZ: {
            get(): number {
                return maxZ;
            },
            enumerable: false,
            configurable: false,
        },
    });

    return spreadRaysGenerator as SpreadRaysGenerator;
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
    if (v < 0 || u + v > 1) return;

    // line intersection
    const t = e2.dot(q) * invDenom;

    // our finite line intersects the triangle
    if (t > EPSILON) {
        return D.multiplyBy(t).add(P);
    }
}

MODULE.debugExpose("geometry", {
    createSpreadRaysGenerator,
    createTokenSpreadGenerator,
    getSideOfPointFromLine,
    getTokenDepth,
    lineIntersectTriangle,
    Vector,
});

type RectEdge = { A: Point; B: Point };
type RectEdges = Record<"top" | "right" | "bottom" | "left", RectEdge>;

type GeneratedSpreadRay = [origin: Vector, target: Vector, direction: Vector];
type SpreadRaysGenerator = (() => Generator<GeneratedSpreadRay, void, unknown>) & {
    get eliminate(): boolean;
    get minZ(): number;
    get maxZ(): number;
};
type TokenSpreadGenerator = (() => Generator<Vector, void, unknown>) & {
    get depth(): number;
    get elevation(): number;
    get eliminate(): boolean;
};

export { createBoundaryFromTokens, createSpreadRaysGenerator, getSideOfPointFromLine, lineIntersectTriangle };
export type { RectEdge, RectEdges, SpreadRaysGenerator };
