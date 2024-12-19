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
import { globalSetting } from "../settings";

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

    socket.toggle(enabled && game.user.isGM);

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

async function droppethItem({ item, x, y, quantity }: DroppethOptions, userId: string) {
    const scene = canvas.scene;
    if (!scene) return;

    const withContent = globalSetting("withContent");
    const transferData = await getTransferData({
        item,
        quantity,
        withContent,
    });

    if (!transferData) return;

    const folder =
        game.folders.getName("__Droppeth") ??
        (await getDocumentClass("Folder").create({ name: "__Droppeth", type: "Actor" }));

    const tokenId = foundry.utils.randomID();
    const tokenUuid = `${scene.uuid}.Token.${tokenId}`;
    const { name, img } = item;

    const actorSource: PreCreate<ActorSourcePF2e> = {
        type: "loot",
        name,
        folder: folder?.id,
        items: transferData.itemSources,
        img,
        ownership: { default: CONST.USER_ROLES.ASSISTANT },
    };

    setFlagProperty(actorSource, "temporary", true);
    setFlagProperty(actorSource, "tokenUuid", tokenUuid);

    const actor = (await getDocumentClass("Actor").create(actorSource, {
        keepEmbeddedIds: true,
    })) as LootPF2e | undefined;
    const mainItem = actor?.inventory.find((x) => x.id === item.id);
    if (!actor || !mainItem) return;

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

    // no source actor so no update required, also no message needed
    if (!item.actor) return;

    await updateTransferSource({
        item,
        quantity: transferData.quantity,
        withContent,
    });

    createTransferMessage({
        sourceActor: item.actor,
        item: mainItem,
        quantity: transferData.quantity,
        cost: 0,
        userId,
        subtitle: localize("message.subtitle"),
        message: localize.path("message.content", actor.inventory.size > 1 ? "container" : "item"),
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
            onDroppethData(item, data.x, data.y);
            return false;
        }
    }
    return true;
}

async function onDroppethData(item: PhysicalItemPF2e | CompendiumIndexData, x: number, y: number) {
    const options: Omit<DroppethPacket, "type"> = { item: item.uuid, x, y };

    if (!(item instanceof Item) || item.pack) {
        droppethRequest(options);
        return;
    }

    const data = await initiateTransfer({ item });
    if (data) {
        options.quantity = data.quantity;
        droppethRequest(options);
    }
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
    item: PhysicalItemPF2e;
    x: number;
    y: number;
    quantity?: number;
};

type DroppethPacket = ExtractSocketOptions<DroppethOptions> & { type: "drop" };

export { config as droppethTool };
