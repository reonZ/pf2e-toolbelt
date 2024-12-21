import {
    ActorPF2e,
    ActorSourcePF2e,
    CanvasPF2e,
    ExtractSocketOptions,
    ItemPF2e,
    LootPF2e,
    PhysicalItemPF2e,
    R,
    TokenDocumentPF2e,
    TokenLightRuleElement,
    createCallOrEmit,
    createTransferMessage,
    getTransferData,
    initiateTransfer,
    isPrimaryUpdater,
    itemIsOfType,
    updateTransferSource,
} from "module-helpers";
import { createTool } from "../tool";
import { globalSettings } from "./global";

const DEFAULT_IMG = "systems/pf2e/icons/default-icons/backpack.svg";

const { config, settings, hooks, wrapper, socket, localize, getFlag, setFlagProperty } = createTool(
    {
        name: "droppeth",
        settings: [
            {
                key: "enabled",
                type: Boolean,
                default: false,
                onChange: (value: boolean) => {
                    wrapper.toggle(value);
                    hooks.toggleAll(value);
                    socket.toggle(value && game.user.isGM);
                },
            },
            {
                key: "removeOnEmpty",
                type: Boolean,
                default: true,
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
                event: "preDeleteToken",
                listener: onPreDeleteToken,
            },
            {
                event: "dropCanvasData",
                listener: onDropCanvasData,
                isUpstream: true,
            },
        ],
        wrappers: [
            {
                key: "actorOnEmbeddedDocumentChange",
                path: "CONFIG.Actor.documentClass.prototype._onEmbeddedDocumentChange",
                callback: actorOnEmbeddedDocumentChange,
            },
        ],
        api: {
            droppethRequest: (...args: Parameters<typeof droppethRequest>) => {
                droppethRequest(...args);
            },
        },
        onSocket: async (packet: DroppethPacket, userId: string) => {
            switch (packet.type) {
                case "drop":
                    droppethRequest(packet, userId);
                    break;
            }
        },
        ready: (isGM) => {
            const enabled = settings.enabled;

            wrapper.toggle(enabled);
            hooks.toggleAll(enabled);
            socket.toggle(enabled && game.user.isGM);
        },
    } as const
);

const droppethRequest = createCallOrEmit("drop", droppethItem, socket);

function onDropCanvasData(canvas: CanvasPF2e, data: DropCanvasData) {
    if (
        data.type !== "Item" ||
        !R.isString(data.uuid) ||
        !game.keyboard.isModifierActive("Control")
    )
        return true;

    const item = fromUuidSync<ItemPF2e>(data.uuid);
    if (!item || !itemIsOfType(item, "physical")) return true;

    (async () => {
        const options: Omit<DroppethPacket, "type"> = { item: item.uuid, x: data.x, y: data.y };

        if (!(item instanceof Item) || item.pack) {
            droppethRequest(options);
            return;
        }

        const initData = await initiateTransfer({
            item,
            title: localize("dialog.title"),
            prompt: localize("dialog.prompt"),
        });

        if (initData) {
            options.quantity = initData.quantity;
            droppethRequest(options);
        }
    })();

    return false;
}

function actorOnEmbeddedDocumentChange(this: ActorPF2e, wrapped: libWrapper.RegisterCallback) {
    wrapped();

    if (!isPrimaryUpdater(this) || !isDroppethActor(this)) return;

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

function getDroppethFolder() {
    return (
        game.folders.getName("__Droppeth") ??
        getDocumentClass("Folder").create({ name: "__Droppeth", type: "Actor" })
    );
}

async function droppethItem({ item, x, y, quantity }: DroppethOptions, userId: string) {
    const scene = canvas.scene;
    if (!scene) {
        localize.error("error.no-scene");
        return;
    }

    const withContent = globalSettings.withContent;
    const transferData = await getTransferData({
        item,
        quantity,
        withContent,
    });

    if (!transferData) {
        localize.error("error.unknown");
        return;
    }

    const folder = await getDroppethFolder();

    const tokenId = foundry.utils.randomID();
    const tokenUuid = `${scene.uuid}.Token.${tokenId}`;
    const { name, img } = item;

    const actorSource: PreCreate<ActorSourcePF2e> = {
        type: "loot",
        name,
        folder: folder?.id,
        items: [transferData.itemSource, ...transferData.contentSources],
        img,
    };

    setFlagProperty(actorSource, "temporary", true);
    setFlagProperty(actorSource, "tokenUuid", tokenUuid);

    const actor = (await getDocumentClass("Actor").create(actorSource, {
        keepEmbeddedIds: true,
    })) as LootPF2e | undefined;
    const mainItem = actor?.inventory.find((x) => x.id === transferData.itemSource._id);

    if (!actor || !mainItem) {
        localize.error("error.unknown");
        await actor?.delete();
        return;
    }

    const tokenSource: DeepPartial<TokenDocumentPF2e["_source"]> = {
        _id: tokenId,
        name,
        sort: Math.max(canvas.tokens.getMaxSort() + 1, 0),
        width: 0.5,
        height: 0.5,
        texture: { src: img },
        ring: { enabled: false },
    };

    if (settings.light) {
        tokenSource.light = getLightSource(item);
    }

    const tokenDocument = await actor.getTokenDocument(tokenSource, { parent: scene });
    const token = canvas.tokens.createObject(
        // @ts-expect-error
        tokenDocument
    );

    let position = token.getCenterPoint({ x: 0, y: 0 });
    position.x = x - position.x;
    position.y = y - position.y;
    position = token.getSnappedPosition(position);

    token.destroy({ children: true });
    tokenDocument.updateSource(position);

    if (!canvas.dimensions.rect.contains(tokenDocument.x, tokenDocument.y)) {
        localize.error("error.out-of-bounds");
        await actor.delete();
        return;
    }

    canvas.tokens.activate();
    await getDocumentClass("Token").create(
        // @ts-expect-error
        tokenDocument,
        { parent: canvas.scene, keepId: true }
    );

    // no source actor so no update required, also no message needed
    if (!item.actor) return;

    await updateTransferSource({
        item,
        quantity: transferData.quantity,
        withContent,
    });

    if (!settings.message) return;

    createTransferMessage({
        sourceActor: item.actor,
        item: mainItem,
        quantity: transferData.quantity,
        cost: 0,
        userId,
        subtitle: localize("message.subtitle"),
        message: localize.path(
            "message.content",
            transferData.contentSources.length ? "container" : "item"
        ),
    });
}

async function onPreDeleteToken(token: TokenDocumentPF2e) {
    const actor = getDroppethActor(token);
    actor?.delete();
}

function getDroppethActor(token: TokenDocumentPF2e) {
    const actor = token.actor;
    return isDroppethActor(actor) ? actor : null;
}

function isDroppethActor(actor: Maybe<ActorPF2e>): actor is LootPF2e {
    return !!actor?.isOfType("loot") && !!getFlag(actor, "temporary");
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
    item: PhysicalItemPF2e;
    x: number;
    y: number;
    quantity?: number;
};

type DroppethPacket = ExtractSocketOptions<"drop", DroppethOptions>;

export { config as droppethTool };
