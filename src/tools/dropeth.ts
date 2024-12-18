import {
    ActorSourcePF2e,
    CanvasPF2e,
    ItemPF2e,
    R,
    TokenDocumentPF2e,
    createCallOrEmit,
    itemIsOfType,
} from "module-helpers";
import { createTool } from "../tool";

const { config, settings, hooks, socket, getFlag, setFlagProperty } = createTool({
    name: "dropeth",
    settings: [
        {
            key: "enabled",
            type: Boolean,
            default: false,
            onChange: (value: boolean) => {
                hooks.toggleAll(value);
            },
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
    onSocket: async (packet: DropethPacket, userId: string) => {
        switch (packet.type) {
            case "drop":
                dropethRequest(packet, userId);
                break;
        }
    },
    ready: () => {
        if (!settings.enabled) return;

        hooks.activateAll();
    },
} as const);

const dropethRequest = createCallOrEmit("drop", dropethItem, socket);

async function dropethItem(
    { item, x, y }: { item: ItemPF2e; x: number; y: number },
    userId: string
) {
    if (!item?.isOfType("physical")) return;

    const folder =
        game.folders.getName("__Dropeth") ??
        (await getDocumentClass("Folder").create({ name: "__Dropeth", type: "Actor" }));

    const actorSource: PreCreate<ActorSourcePF2e> = {
        type: "loot",
        name: item.name,
        folder: folder?.id,
        items: [item.toObject()],
        img: item.img,
        ownership: { [userId]: 3 },
        prototypeToken: { actorLink: true },
    };

    setFlagProperty(actorSource, "temporary", true);

    const actor = await getDocumentClass("Actor").create(actorSource);
    if (!actor) return;

    const tokenDocument = await actor.getTokenDocument(
        {
            sort: Math.max(canvas.tokens.getMaxSort() + 1, 0),
            width: 0.5,
            height: 0.5,
            texture: { src: item.img },
            ring: { enabled: false },
        },
        { parent: canvas.scene }
    );

    const token = canvas.tokens.createObject(tokenDocument);

    let position = token.getCenterPoint({ x: 0, y: 0 });
    position.x = x - position.x;
    position.y = y - position.y;
    position = token.getSnappedPosition(position);

    token.destroy({ children: true });
    tokenDocument.updateSource(position);

    if (canvas.dimensions.rect.contains(tokenDocument.x, tokenDocument.y)) {
        canvas.tokens.activate();
        getDocumentClass("Token").create(tokenDocument, { parent: canvas.scene });
    }
}

function onDropCanvasData(_canvas: CanvasPF2e, data: DropCanvasData) {
    if (data.type !== "Item" && data.type !== "PersistentDamage") {
        return true;
    }

    if (
        R.isString(data.uuid) &&
        data.type === "Item" &&
        game.keyboard.isModifierActive("Control")
    ) {
        const item = fromUuidSync<ItemPF2e>(data.uuid);

        if (item && itemIsOfType(item, "physical")) {
            dropethRequest({ item: data.uuid, x: data.x, y: data.y });
            return false;
        }
    }

    const dropTarget = [...canvas.tokens.placeables]
        .sort((a, b) => b.document.sort - a.document.sort)
        .sort((a, b) => b.document.elevation - a.document.elevation)
        .find((t) => t.bounds.contains(data.x, data.y));

    const actor = dropTarget?.actor;
    if (actor) {
        const dataTransfer = new DataTransfer();
        dataTransfer.setData("text/plain", JSON.stringify(data));
        const event = new DragEvent("drop", {
            altKey: game.keyboard.isModifierActive("Alt"),
            dataTransfer,
        });
        actor.sheet._onDrop(event);
        return false; // Prevent modules from doing anything further - HAHAHA
    }

    return true;
}

function onPreDeleteToken(token: TokenDocumentPF2e) {
    const actor = token.actor;
    if (actor?.isOfType("loot") && getFlag(actor, "temporary")) {
        actor.delete();
    }
}

type DropethPacket = { type: "drop"; item: ItemPF2e; x: number; y: number };

export { config as dropethTool };
