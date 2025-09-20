import {
    ActionCost,
    ActorPF2e,
    createFormData,
    getActionGlyph,
    getPreferredName,
    PhysicalItemPF2e,
    R,
} from "module-helpers";

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
        item: await foundry.applications.ux.TextEditor.implementation.enrichHTML(item.link),
    };

    const glyph = getActionGlyph(
        cost ?? (source.isOfType("loot") && target?.isOfType("loot") ? 2 : 1)
    );

    const flavor = await foundry.applications.handlebars.renderTemplate(
        "./systems/pf2e/templates/chat/action/flavor.hbs",
        {
            action: { title: "PF2E.Actions.Interact.Title", subtitle, glyph },
            traits: [
                {
                    name: "manipulate",
                    label: CONFIG.PF2E.featTraits.manipulate,
                    description: CONFIG.PF2E.traitsDescriptions.manipulate,
                },
            ],
        }
    );

    const content = await foundry.applications.handlebars.renderTemplate(
        "./systems/pf2e/templates/chat/action/content.hbs",
        {
            imgPath: item.img,
            message: game.i18n.format(message, formattedMessageData).replace(/\b1 × /, ""),
        }
    );

    return getDocumentClass("ChatMessage").create({
        author: userId ?? game.userId,
        speaker: { alias: sourceName },
        style: CONST.CHAT_MESSAGE_STYLES.EMOTE,
        flavor,
        content,
    });
}

async function createTradeQuantityDialog(
    options: TradeQuantityDialogOptions
): Promise<TradeQuantityDialogData | null> {
    const data = {
        ...options,
        mode: R.isBoolean(options.lockStack) ? "" : "gift",
        quantity: options.quantity ?? options.item.quantity,
        rootId: "item-transfer-dialog",
    };

    const content = await foundry.applications.handlebars.renderTemplate(
        "systems/pf2e/templates/popups/item-transfer-dialog.hbs",
        data
    );

    return new Promise((resolve) => {
        foundry.applications.api.DialogV2.wait({
            buttons: [
                {
                    ...options.button,
                    type: "submit",
                    callback: (event, button, dialog) => {
                        const data = createFormData(dialog.element) as TradeQuantityDialogData;
                        resolve(data);
                    },
                },
            ],
            content,
            id: "item-transfer-dialog",
            position: {
                width: 450,
            },
            window: {
                icon: options.button.icon,
                contentClasses: ["standard-form"],
                title: options.title,
            },
            close: () => {
                resolve(null);
            },
        });
    });
}

type TradeQuantityDialogOptions = {
    button: {
        action: string;
        icon: string;
        label: string;
    };
    item: PhysicalItemPF2e;
    lockStack?: boolean;
    prompt: string;
    quantity?: number;
    targetActor?: ActorPF2e;
    title: string;
};

type TradeQuantityDialogData = {
    quantity: number;
    newStack?: boolean;
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

export { createTradeMessage, createTradeQuantityDialog };
export type { TradeMessageOptions, TradeQuantityDialogData };
