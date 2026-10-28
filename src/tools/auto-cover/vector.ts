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

    add({ x = 0, y = 0, z = 0 }: Partial<Point3d>): Vector {
        return new Vector(this.x + x, this.y + y, this.z + z);
    }

    cross(other: Point3d): Vector {
        return new Vector(
            this.y * other.z - this.z * other.y,
            this.z * other.x - this.x * other.z,
            this.x * other.y - this.y * other.x,
        );
    }

    divideBy(value: number): Vector {
        return new Vector(this.x / value, this.y / value, this.z / value);
    }

    dot(other: Point3d): number {
        return this.x * other.x + this.y * other.y + this.z * other.z;
    }

    equals(other: Point3d): boolean {
        return this.equals2d(other) && this.z === other.z;
    }

    equals2d(other: Point3d): boolean {
        return this.x === other.x && this.y === other.y;
    }

    moveTowardByScalar(other: Vector, value: number): Vector {
        return other.subtract(this).multiplyBy(value).add(this);
    }

    multiplyBy(value: number): Vector {
        return new Vector(this.x * value, this.y * value, this.z * value);
    }

    rotate90(inverted?: boolean): Vector {
        return inverted ? new Vector(this.y, -this.x) : new Vector(-this.y, this.x);
    }

    subtract({ x = 0, y = 0, z = 0 }: Partial<Point3d>): Vector {
        return new Vector(this.x - x, this.y - y, this.z - z);
    }
}

type Point3d = { x: number; y: number; z: number };

export { Vector };
