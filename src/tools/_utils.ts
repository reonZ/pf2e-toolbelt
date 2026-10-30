import {
    ActionCost,
    ActorPF2e,
    createFormData,
    enrichHTML,
    getActionGlyph,
    getPreferredName,
    itemCheckedValue,
    itemIsCredits,
    PhysicalItemPF2e,
    R,
    SYSTEM,
} from "foundry-helpers";

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

async function createTradeMessage({
    cost,
    item,
    message,
    quantity,
    source,
    subtitle,
    target,
    userId,
}: TradeMessageOptions) {
    const sourceName = getPreferredName(source);
    const targetName = target ? getPreferredName(target) : "";

    const formattedMessageData = {
        source: sourceName,
        target: targetName,
        seller: sourceName,
        buyer: targetName,
        quantity: quantity ?? 1,
        item: await enrichHTML(item.link),
    };

    const glyph = getActionGlyph(cost ?? (source.isOfType("loot") && target?.isOfType("loot") ? 2 : 1));

    const flavor = await foundry.applications.handlebars.renderTemplate(
        SYSTEM.relativePath("templates/chat/action/flavor.hbs"),
        {
            action: { title: "PF2E.Actions.Interact.Title", subtitle, glyph },
            traits: [
                {
                    name: "manipulate",
                    label: CONFIG.PF2E.featTraits.manipulate,
                    description: CONFIG.PF2E.traitsDescriptions.manipulate,
                },
            ],
        },
    );

    const content = await foundry.applications.handlebars.renderTemplate(
        SYSTEM.relativePath("templates/chat/action/content.hbs"),
        {
            imgPath: item.img,
            message: game.i18n.format(message, formattedMessageData).replace(/\b1 × /, ""),
        },
    );

    return getDocumentClass("ChatMessage").create({
        author: userId ?? game.userId,
        speaker: { alias: sourceName },
        style: CONST.CHAT_MESSAGE_STYLES.EMOTE,
        flavor,
        content,
    });
}

async function createTradeQuantityDialog<A extends string>(
    options: TradeQuantityDialogOptions<A>,
): Promise<TradeQuantityDialogData<A> | null> {
    const item = options.item;
    const checkValue = itemCheckedValue(item);
    const data = {
        ...options,
        maxQuantity: options.maxQuantity ?? checkValue,
        mode: itemIsCredits(item) ? "credits" : R.isBoolean(options.lockStack) ? "move" : "gift",
        quantity: options.quantity ?? checkValue,
        rootId: "item-transfer-dialog",
    };

    const content = await foundry.applications.handlebars.renderTemplate(
        SYSTEM.relativePath("templates/popups/item-transfer-dialog.hbs"),
        data,
    );

    return new Promise((resolve) => {
        foundry.applications.api.DialogV2.wait({
            buttons: options.buttons.map((btnOptions) => {
                return {
                    ...btnOptions,
                    type: "submit",
                    callback: (_event, _button, dialog) => {
                        const data = createFormData(dialog.element) as Omit<TradeQuantityDialogData, "action">;
                        resolve({ ...data, action: btnOptions.action });
                    },
                };
            }),
            content,
            id: "item-transfer-dialog",
            position: {
                width: 450,
            },
            render: (_event, dialog) => {
                options.render?.(dialog.element);
            },
            window: {
                icon: options.buttons[0].icon,
                contentClasses: ["standard-form"],
                title: options.title,
            },
            close: () => {
                resolve(null);
            },
        });
    });
}

function lineIntersect(origin: Point, target: Point, debug: boolean): boolean {
    const intersects = CONFIG.Canvas.polygonBackends.move.testCollision(origin, target, { type: "move", mode: "any" });

    if (debug) {
        drawDebug(intersects ? "red" : "green", origin, target);
    }

    return intersects;
}

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

type TradeQuantityDialogOptions<A extends string = string> = {
    buttons: {
        action: A;
        icon: string;
        label: string;
    }[];
    icon?: string;
    item: PhysicalItemPF2e;
    lockStack?: boolean;
    maxQuantity?: number;
    prompt: string;
    quantity?: number;
    render?: (html: HTMLElement) => void;
    targetActor?: ActorPF2e;
    title: string;
};

type TradeQuantityDialogData<A extends string = string> = {
    action: A;
    quantity: number;
    newStack: boolean;
    mode?: "move" | "purchase" | "gift" | "credits";
};

type TradeMessageOptions = {
    /** localization key */
    cost?: string | number | null | ActionCost;
    item: PhysicalItemPF2e;
    message: string;
    quantity?: number;
    source: ActorPF2e;
    subtitle: string;
    target?: ActorPF2e;
    userId?: string;
};

type MaybePoint3d = Point & { z?: number };

export { clearDebug, createTradeMessage, createTradeQuantityDialog, drawDebug, drawDebugText, lineIntersect };
export type { TradeMessageOptions, TradeQuantityDialogData, TradeQuantityDialogOptions };
