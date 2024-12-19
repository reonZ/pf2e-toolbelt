import {
    ActorPF2e,
    ActorSourcePF2e,
    CanvasPF2e,
    ItemPF2e,
    LootPF2e,
    PhysicalItemPF2e,
    R,
    TokenDocumentPF2e,
    TokenLightRuleElement,
    addListener,
    createCallOrEmit,
    createTradeMessage,
    htmlQuery,
    isInstanceOf,
    isPrimaryUpdater,
    itemIsOfType,
} from "module-helpers";
import { createTool } from "../tool";

const DEFAULT_IMG = "systems/pf2e/icons/default-icons/backpack.svg";

const debouncedSetup = foundry.utils.debounce(setup, 1);

const { config, settings, hooks, wrapper, socket, localize, getFlag, setFlagProperty } = createTool(
    {
        name: "droppeth",
        settings: [
            {
                key: "enabled",
                type: Boolean,
                default: false,
                onChange: debouncedSetup,
            },
            {
                key: "removeOnEmpty",
                type: Boolean,
                default: true,
                onChange: debouncedSetup,
            },
            {
                key: "light",
                type: Boolean,
                default: true,
            },
            {
                key: "message",
                type: Boolean,
                default: true,
            },
        ],
        hooks: [
            {
                event: "dropCanvasData",
                listener: onDropCanvasData,
                isUpstream: true,
            },
            {
                event: "preDeleteToken",
                listener: onPreDeleteToken,
            },
        ],
        wrappers: [
            {
                key: "actorOnEmbeddedDocumentChange",
                path: "CONFIG.Actor.documentClass.prototype._onEmbeddedDocumentChange",
                callback: actorOnEmbeddedDocumentChange,
            },
        ],
        onSocket: async (packet: DroppethPacket, userId: string) => {
            switch (packet.type) {
                case "drop":
                    droppethRequest(packet, userId);
                    break;
            }
        },
        ready: setup,
    } as const
);

const droppethRequest = createCallOrEmit("drop", droppethItem, socket);

function setup() {
    const enabled = settings.enabled;

    wrapper.toggle(enabled && settings.removeOnEmpty);

    hooks.dropCanvasData.toggle(enabled);
    hooks.preDeleteToken.toggle(enabled);
}

function actorOnEmbeddedDocumentChange(this: ActorPF2e, wrapped: libWrapper.RegisterCallback) {
    wrapped();

    if (!isDroppethActor(this, true)) return;

    (async () => {
        const token = await getDroppethToken(this);

        if (this.inventory.size === 0 && settings.removeOnEmpty) {
            token?.delete();
            return;
        }

        const onlyItem = R.only(this.inventory.contents);
        const { img, name } = onlyItem ?? getDefaultData();

        const tokenUpdate: Record<string, any> = { "texture.src": img, name };

        if (settings.light) {
            tokenUpdate.light = getLightSource(onlyItem);
        }

        await this.update({ img, name });
        await token?.update(tokenUpdate);
    })();
}

async function droppethItem(options: DroppethOptions, userId: string) {
    const scene = canvas.scene;
    if (!scene) return;

    const items = R.pipe(
        await Promise.all(options.items.map((uuid) => fromUuid(uuid))),
        R.filter(
            (item): item is PhysicalItemPF2e =>
                isInstanceOf(item, "ItemPF2e") && item.isOfType("physical")
        )
    );

    if (!items.length) return;

    const onlyItem = R.only(items);
    const sourceActor = items[0].actor;
    const itemSources = items.map((item) => item.toObject());

    if (onlyItem && R.isNumber(options.quantity)) {
        options.quantity = Math.min(onlyItem.quantity, options.quantity);
        if (options.quantity <= 0) return;

        itemSources[0].system.quantity = options.quantity;
    }

    const folder =
        game.folders.getName("__Droppeth") ??
        (await getDocumentClass("Folder").create({ name: "__Droppeth", type: "Actor" }));

    const tokenId = foundry.utils.randomID();
    const tokenUuid = `${scene.uuid}.Token.${tokenId}`;
    const { name, img } = onlyItem ?? getDefaultData();

    const actorSource: PreCreate<ActorSourcePF2e> = {
        type: "loot",
        name,
        folder: folder?.id,
        items: itemSources,
        img,
        ownership: { default: CONST.USER_ROLES.ASSISTANT },
    };

    setFlagProperty(actorSource, "temporary", true);
    setFlagProperty(actorSource, "tokenUuid", tokenUuid);

    const actor = (await getDocumentClass("Actor").create(actorSource)) as LootPF2e | undefined;
    if (!actor) return;

    const tokenSource: DeepPartial<TokenDocumentPF2e["_source"]> = {
        _id: tokenId,
        name,
        sort: Math.max(canvas.tokens.getMaxSort() + 1, 0),
        width: 0.5,
        height: 0.5,
        texture: { src: img },
        ring: { enabled: false },
    };

    if (onlyItem && settings.light) {
        tokenSource.light = getLightSource(onlyItem);
    }

    const tokenDocument = await actor.getTokenDocument(tokenSource, { parent: scene });

    const token = canvas.tokens.createObject(
        // @ts-expect-error
        tokenDocument
    );

    let position = token.getCenterPoint({ x: 0, y: 0 });
    position.x = options.x - position.x;
    position.y = options.y - position.y;
    position = token.getSnappedPosition(position);

    token.destroy({ children: true });
    tokenDocument.updateSource(position);

    if (!canvas.dimensions.rect.contains(tokenDocument.x, tokenDocument.y)) {
        await actor.delete();
        localize.error("error.out-of-bounds");
        return;
    }

    canvas.tokens.activate();

    await getDocumentClass("Token").create(
        // @ts-expect-error
        tokenDocument,
        { parent: canvas.scene, keepId: true }
    );

    // no source actor so no need to update anything
    if (!sourceActor) return;

    if (onlyItem && R.isNumber(options.quantity)) {
        const newQuantity = onlyItem.quantity - options.quantity;

        if (newQuantity <= 0) {
            await onlyItem.delete();
        } else {
            await onlyItem.update({ "system.quantity": newQuantity });
        }
    } else {
        const ids = items.map((item) => item.id);

        if (ids) {
            await sourceActor.deleteEmbeddedDocuments("Item", ids);
        }
    }

    if (!settings.message) return;

    createTradeMessage({
        origin: sourceActor,
        cost: 0,
        item: onlyItem ? actor.inventory.contents[0] : undefined,
        imgPath: DEFAULT_IMG,
        quantity: options.quantity ?? 1,
        userId,
        subtitle: localize("message.subtitle"),
        message: localize.path("message.content", onlyItem ? "item" : "bag"),
    });
}

function onDropCanvasData(_canvas: CanvasPF2e, data: DropCanvasData) {
    if (
        data.type === "Item" &&
        R.isString(data.uuid) &&
        game.keyboard.isModifierActive("Control")
    ) {
        const item = fromUuidSync<ItemPF2e>(data.uuid);
        if (item && itemIsOfType(item, "physical")) {
            onDroppeth(item, data.x, data.y);
            return false;
        }
    }
    return true;
}

async function onDroppeth(item: PhysicalItemPF2e | CompendiumIndexData, x: number, y: number) {
    const options: DroppethOptions = { items: [item.uuid], x, y };

    if (!(item instanceof Item) || item.pack) {
        droppethRequest(options);
        return;
    }

    if (item.quantity > 1) {
        const label = localize("dialog.title");
        const quantity = await Dialog.wait(
            {
                title: label,
                content: await renderTemplate(
                    "systems/pf2e/templates/popups/item-transfer-dialog.hbs",
                    {
                        prompt: game.i18n.localize("PF2E.loot.MoveLootMessage"),
                        quantity: item.quantity,
                        lockStack: true,
                        item,
                    }
                ),
                buttons: {
                    yes: {
                        label,
                        icon: "<i class='fa-regular fa-save'></i>",
                        callback: ($html) => {
                            const html = $html instanceof HTMLElement ? $html : $html[0];
                            return (
                                htmlQuery<HTMLInputElement>(html, "input[name='quantity']")
                                    ?.valueAsNumber ?? 1
                            );
                        },
                    },
                },
                close: () => null,
                render: ($html) => {
                    const html = $html instanceof HTMLElement ? $html : $html[0];

                    htmlQuery(html, ".dialog-content .dialog-buttons")?.remove();

                    addListener(
                        html,
                        "input",
                        "keydown",
                        (event, el) => {
                            if (event.key === "Enter") {
                                htmlQuery(html.nextElementSibling, "button")?.click();
                            }
                        },
                        true
                    );
                },
            },
            { classes: ["dialog", "item-transfer"] }
        );

        if (!R.isNumber(quantity) || quantity <= 0) return;

        options.quantity = quantity;
    }

    droppethRequest(options);
}

function onPreDeleteToken(token: TokenDocumentPF2e) {
    const actor = isDroppethToken(token);
    actor?.delete();
}

function isDroppethToken(token: TokenDocumentPF2e, primaryOnly?: boolean) {
    const actor = token.actor;
    return isDroppethActor(actor, primaryOnly) ? actor : null;
}

function isDroppethActor(actor: Maybe<ActorPF2e>, primaryOnly?: boolean): actor is LootPF2e {
    return (
        !!actor?.isOfType("loot") &&
        !!getFlag(actor, "temporary") &&
        (!primaryOnly || isPrimaryUpdater(actor))
    );
}

function getDroppethToken(actor: LootPF2e) {
    const uuid = getFlag<string>(actor, "tokenUuid");
    return uuid ? fromUuid<TokenDocumentPF2e>(uuid) : null;
}

function getLightSource(item?: PhysicalItemPF2e) {
    const itemRules = item && item.quantity > 0 ? item.system.rules : undefined;
    const lightRule = itemRules?.find(
        (rule): rule is TokenLightRuleElement => rule.key === "TokenLight"
    );
    return new foundry.data.LightData(lightRule?.value).toObject();
}

function getDefaultData() {
    return {
        img: DEFAULT_IMG,
        name: game.i18n.localize("TYPES.Actor.loot"),
    } as const;
}

type DroppethOptions = {
    items: string[];
    x: number;
    y: number;
    quantity?: number;
};

type DroppethPacket = DroppethOptions & { type: "drop" };

export { config as droppethTool };
