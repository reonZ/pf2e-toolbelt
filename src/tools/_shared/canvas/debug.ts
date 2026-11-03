import { R } from "foundry-helpers";

const DEBUG_FONT_SIZE = 20;
const DEBUG_FONT_STROKE = Math.max(Math.round(DEBUG_FONT_SIZE / 32), 2);
const DEBUG_FONT_STYLE = foundry.canvas.containers.PreciseText.getTextStyle({
    fontSize: DEBUG_FONT_SIZE,
    fill: "#ffffff",
    strokeThickness: DEBUG_FONT_STROKE,
    dropShadowBlur: Math.max(Math.round(DEBUG_FONT_SIZE / 16), 2),
    align: "center",
    padding: DEBUG_FONT_STROKE * 4,
});

function clearDebug() {
    canvas.controls.debug.clear();
    canvas.controls.debug.removeChildren();
}

function drawDebug(color: PIXI.ColorSource, ...points: [MaybePoint3d, number]): void;
function drawDebug(color: PIXI.ColorSource, ...points: [...MaybePoint3d[], MaybePoint3d, MaybePoint3d, boolean]): void;
function drawDebug(color: PIXI.ColorSource, ...points: [...MaybePoint3d[], MaybePoint3d, MaybePoint3d]): void;
function drawDebug(color: PIXI.ColorSource, ...points: (MaybePoint3d | boolean | number)[]) {
    const last = points.at(-1) as MaybePoint3d | boolean | number;
    const path = (R.isObjectType(last) ? points : points.slice(0, -1)) as MaybePoint3d[];

    if (path.length < 1) return false;

    if (R.isNumber(last)) {
        canvas.controls.debug.lineStyle(4, color).beginFill(color).drawCircle(path[0].x, path[0].y, last).endFill();
        return true;
    }

    if (path.length < 2) return false;

    if (last === true) {
        canvas.controls.debug
            .lineStyle(4, color)
            .drawPolygon(...path)
            .finishPoly();
    } else {
        canvas.controls.debug
            .lineStyle(4, color)
            .drawPath(...path)
            .closePath();
    }

    return true;
}

function drawDebugText(point: MaybePoint3d, position?: MaybePoint3d) {
    const coords = R.pipe(
        point,
        R.pick(["x", "y", "z"]),
        R.values(),
        R.map((x) => Math.trunc(x)),
        R.join(","),
    );

    const text = `{${coords}}`;
    const preciseText = new foundry.canvas.containers.PreciseText(text, DEBUG_FONT_STYLE);

    preciseText.x = (position ?? point).x - preciseText.width / 2;
    preciseText.y = (position ?? point).y - 5 - preciseText.height;

    canvas.controls.debug.addChild(preciseText);
}

type MaybePoint3d = Point & { z?: number };

export { clearDebug, drawDebug, drawDebugText };
