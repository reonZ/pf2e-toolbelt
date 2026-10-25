import { TokenPF2e } from "foundry-helpers";
import { lineIntersect } from "tools";

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

const EPSILON = 0.0000001;

class Vector {
    #x: number;
    #y: number;
    #z: number;

    constructor(x: number, y: number, z: number) {
        this.#x = x;
        this.#y = y;
        this.#z = z;
    }

    static fromData(position: Point, elevation: number): Vector {
        return new Vector(position.x, position.y, elevation);
    }

    get x(): number {
        return this.#x;
    }

    get y(): number {
        return this.#y;
    }

    get z(): number {
        return this.#z;
    }

    add(other: Vector): Vector {
        return new Vector(this.x + other.x, this.y + other.y, this.z + other.z);
    }

    cross(other: Vector): Vector {
        return new Vector(
            this.y * other.z - this.z * other.y,
            this.z * other.x - this.x * other.z,
            this.x * other.y - this.y * other.x,
        );
    }

    dot(other: Vector): number {
        return this.x * other.x + this.y * other.y + this.z * other.z;
    }

    multiply(value: number): Vector {
        return new Vector(this.x * value, this.y * value, this.z * value);
    }

    subtract(other: Vector): Vector {
        return new Vector(this.x - other.x, this.y - other.y, this.z - other.z);
    }
}

class Vector2d extends Vector {
    constructor(x: number, y: number) {
        super(x, y, 0);
    }

    static fromData(position: Point): Vector {
        return new Vector2d(position.x, position.y);
    }

    get z(): number {
        return 0;
    }
}

function getSideOfPointFromLine(v0: Point, v1: Point, p: Point): -1 | 0 | 1 {
    const d = (v1.x - v0.x) * (p.y - v0.y) - (v1.y - v0.y) * (p.x - v0.x);
    return d > 0 ? 1 : d < 0 ? -1 : 0;
}

function project90(v0: Vector, v1: Vector) {
    const v = v1.subtract(v0);
}

function getTokenDepth(token: TokenPF2e): number {
    const gridSize = token.scene?.grid.size ?? 100;
    const actor = token.actor;

    if (actor?.isOfType("vehicle")) {
        return actor.system.details.space.high * gridSize;
    }

    if (actor?.isOfType("creature") && token.document.width === token.document.height) {
        return token.document.width * gridSize;
    }

    // not really sure what to do here in case of non squared bounds
    return Math.min(token.document.width, token.document.height) * gridSize;
}

function tokenCenter3d(token: TokenPF2e): Vector {
    return Vector.fromData(token.center, token.document.elevation + getTokenDepth(token) / 2);
}

// Möller–Trumbore implementation
function lineIntersectTriangle(O: Vector, D: Vector, v0: Vector, v1: Vector, v2: Vector): Vector | undefined {
    const e1 = v1.subtract(v0);
    const e2 = v2.subtract(v0);
    const N = D.cross(e2);
    const denom = e1.dot(N);

    // line is parallel to plane
    if (Math.abs(denom) < EPSILON) return;

    const invDenom = 1 / denom;
    const w0 = O.subtract(v0);
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
        return D.multiply(t).add(O);
    }
}

function _lineIntersectTriangle(O: Vector, U: Vector, v0: Vector, v1: Vector, v2: Vector) {
    const e1 = v1.subtract(v0);
    const e2 = v2.subtract(v0);
    const N = e1.cross(e2);
    const w0 = O.subtract(v0);
    const denom = N.dot(U);

    // line is parallel to plane
    if (Math.abs(denom) < EPSILON) return;

    const P = -N.dot(w0) / denom;
    // no intersection
    if (P < 0 || P > 1) return;

    // intersect point of line and plane
    const I = U.multiply(P).add(O);

    // we test if I is inside the triangle
    const uu = e1.dot(e1);
    const uv = e1.dot(e2);
    const vv = e2.dot(e2);
    const w = I.subtract(v0);
    const wu = w.dot(e1);
    const wv = w.dot(e2);
    const D = uv * uv - uu * vv;

    // get and test parametric coords
    const c1 = (uv * wv - vv * wu) / D;
    if (c1 < 0 || c1 > 1) return;
    const c2 = (uv * wu - uu * wv) / D;
    if (c2 < 0 || c1 + c2 > 1) return;

    return 1;
}

type RectEdge = { A: Point; B: Point };
type RectEdges = Record<"top" | "right" | "bottom" | "left", RectEdge>;

export {
    getRectEdges,
    getSideOfPointFromLine,
    lineIntersectTriangle,
    spreadToToken,
    tokenCenter3d,
    tokenToSpread,
    Vector,
    Vector2d,
};
export type { RectEdge, RectEdges };
