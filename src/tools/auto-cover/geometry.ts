import { ScenePF2e, TokenDocumentPF2e, TokenPF2e } from "foundry-helpers";
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

    constructor(x: number, y: number, z: number = 0) {
        this.#x = x;
        this.#y = y;
        this.#z = z;
    }

    static fromData(position: Point, elevation: number = 0): Vector {
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

    get magnitude(): number {
        return Math.sqrt(this.x ** 2 + this.y ** 2 + this.z ** 2);
    }

    get normalize(): Vector {
        return this.divideBy(this.magnitude);
    }

    get position(): Point {
        return { x: this.x, y: this.y };
    }

    get vector2d(): Vector {
        return new Vector(this.x, this.y);
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

    divideBy(value: number): Vector {
        return new Vector(this.x / value, this.y / value, this.z / value);
    }

    dot(other: Vector): number {
        return this.x * other.x + this.y * other.y + this.z * other.z;
    }

    equals(other: Vector): boolean {
        return this.equals2d(other) && this.z === other.z;
    }

    equals2d(other: Vector): boolean {
        return this.x === other.x && this.y === other.y;
    }

    multiplyBy(value: number): Vector {
        return new Vector(this.x * value, this.y * value, this.z * value);
    }

    subtract(other: Vector): Vector {
        return new Vector(this.x - other.x, this.y - other.y, this.z - other.z);
    }
}

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

function tokenCenter3d(token: TokenDocumentPF2e<ScenePF2e>): Vector {
    const offset = token.scene.levels.get(token.level)?.elevation.bottom ?? 0;
    const { size, distance } = token.scene.grid;
    const elevation = (token.elevation - offset) / distance;
    const depth = getTokenDepth(token);
    return Vector.fromData(token.center, (elevation + depth / 2) * size);
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
};
export type { RectEdge, RectEdges };
