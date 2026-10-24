import { ClockwiseSweepPolygonConfig, R, ScenePF2e, TokenDocumentPF2e, TokenPF2e, valueBetween } from "foundry-helpers";
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

    static fromToken(token: TokenPF2e) {
        const center = token.document.center;
        return new Vector(Math.round(center.x), Math.round(center.y), Math.round(token.document.elevation));
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

function belongInTool(originToken: TokenPF2e<TokenDocumentPF2e<ScenePF2e>>, targetToken: TokenPF2e) {
    const scene = originToken.scene;
    const origin = Vector.fromToken(originToken);
    const target = Vector.fromToken(targetToken);
    const width = target.x - origin.x;
    const height = target.y - origin.y;

    // we have nothing to test, they are null
    if (width === 0 && height === 0) return;

    const boundaryShape = new PIXI.Rectangle(origin.x, origin.y, width, height);
    const config: ClockwiseSweepPolygonConfig = {
        type: "move",
        boundaryShapes: [boundaryShape.normalize()],
    };

    const poly = new CONFIG.Canvas.polygonBackends.move();
    poly.initialize(origin, config);
    poly["_identifyEdges"]();

    for (const edge of poly.edges) {
        const wall = edge.object;
        if (!(wall instanceof CONFIG.Wall.documentClass)) continue;
        // TODO use custom check to see if that wall can block cover or not (probably a flag in the document)

        const levels = wall.levels.map((id) => scene.levels.get(id)).filter(R.isTruthy);
        // we retrieve the unique ranges for this edge
        const ranges = R.pipe(
            [...(levels.size ? levels : scene.levels)],
            R.map((level) => [level.elevation.bottom, level.elevation.top] as const),
            R.uniqueWith((a, b) => a[0] === b[0] && a[1] === b[1]),
        );

        for (const [bottom, top] of ranges) {
            // we know we don't have to test elevation so we use the regular foundry logic
            if (valueBetween(origin.z, bottom, top) && valueBetween(target.z, bottom, top)) {
                const x = foundry.utils.lineSegmentIntersection(origin, target, edge.a, edge.b);
            }
        }
    }
}

function lineIntersectPlane(origin: ElevationPoint, target: ElevationPoint, levels: Level[]) {
    const p0 = new Vector(origin.x, origin.y, origin.elevation);
    const p1 = new Vector(target.x, target.y, target.elevation);
    const U = p1.subtract(p0);
}

/** @returns 0 if no intersection, 1 if intersection or 2 if coplanar */
function rayIntersectTriangle(O: Vector, U: Vector, v0: Vector, v1: Vector, v2: Vector) {
    const e1 = v1.subtract(v0);
    const e2 = v2.subtract(v0);
    const n = e1.cross(e2);
    const w0 = O.subtract(v0);
    const a = -n.dot(w0);
    const b = n.dot(U);

    // ray is parallel to plane
    if (Math.abs(b) < EPSILON) {
        return Math.abs(a) < EPSILON ? 2 : 0;
    }

    // get intersect point of ray and plane
    const P = a / b;
    if (P < 0 || P > 1) return 0; // no intersect

    // intersect point of ray and plane
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
    const s = (uv * wv - vv * wu) / D;
    if (s < 0.0 || s > 1.0) return 0;
    const t = (uv * wu - uu * wv) / D;
    if (t < 0.0 || s + t > 1.0) return 0;

    return 1;
}

type ElevationPoint = {
    x: number;
    y: number;
    elevation: number;
};

type RectEdge = { A: Point; B: Point };
type RectEdges = Record<"top" | "right" | "bottom" | "left", RectEdge>;

export { getRectEdges, spreadToToken, tokenToSpread };
export type { RectEdge, RectEdges };
