import {
    ActorPF2e,
    CanvasPF2e,
    createEmitable,
    createHook,
    createToggleableWrapper,
    createToggleKeybind,
    createTradeMessage,
    getTradeData,
    isPrimaryUpdater,
    itemIsOfType,
    ItemPF2e,
    ItemTransferDialog,
    LootPF2e,
    LootSource,
    MoveLootFormData,
    PhysicalItemPF2e,
    positionTokenFromCoords,
    R,
    TokenDocumentPF2e,
    TokenLightRuleElement,
    updateTradedItemSource,
} from "module-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";

class DroppethTool extends ModuleTool<ToolSettings> {
    #deleteTokenHook = createHook("deleteToken", this.#onDeleteToken.bind(this));
    #dropCanvasDataHook = createHook("dropCanvasData", this.#onDropCanvasData.bind(this));

    #droppethItemEmitable = createEmitable(this.key, this.#droppethItem.bind(this));

    #onEmbeddedDocumentChangeWrapper = createToggleableWrapper(
        "WRAPPER",
        "CONFIG.Actor.documentClass.prototype._onEmbeddedDocumentChange",
        this.#actorOnEmbeddedDocumentChange,
        { context: this }
    );

    #droppethKeybind = createToggleKeybind({
        name: "droppeth",
        editable: [{ key: "ControlLeft", modifiers: [] }],
        onDown: () => {
            this.#dropCanvasDataHook.activate();
        },
        onUp: () => {
            this.#dropCanvasDataHook.disable();
        },
    });

    static get DEFAULT_DATA(): { img: ImageFilePath; name: string } {
        return {
            img: "systems/pf2e/icons/default-icons/backpack.svg",
            name: game.i18n.localize("TYPES.Actor.loot"),
        };
    }

    get key(): "droppeth" {
        return "droppeth";
    }

    get settingsSchema(): ToolSettingsList<ToolSettings> {
        return [
            {
                key: "enabled",
                type: Boolean,
                default: false,
                scope: "world",
                onChange: (value) => {},
            },
            {
                key: "light",
                type: Boolean,
                default: true,
                scope: "world",
            },
        ];
    }

    get keybindsSchema(): KeybindingActionConfig[] {
        return [this.#droppethKeybind.configs];
    }

    ready(isGM: boolean): void {
        if (!this.settings.enabled) return;

        this.#droppethKeybind.activate();

        if (isGM) {
            this.#deleteTokenHook.activate();
            this.#droppethItemEmitable.activate();
            this.#onEmbeddedDocumentChangeWrapper.activate();
        }
    }

    isDroppethActor(actor: Maybe<ActorPF2e>): actor is LootPF2e {
        return !!actor?.isOfType("loot") && !!this.getFlag(actor, "temporary");
    }

    getDroppethActor(token: TokenDocumentPF2e): LootPF2e | null {
        const actor = token.actor;
        return this.isDroppethActor(actor) ? actor : null;
    }

    getDroppethToken(actor: LootPF2e): TokenDocumentPF2e | null {
        const uuid = this.getFlag<string>(actor, "tokenUuid");
        return uuid ? (fromUuidSync(uuid) as TokenDocumentPF2e) : null;
    }

    getDroppethFolder() {
        return (
            game.folders.getName("__Droppeth") ??
            getDocumentClass("Folder").create({ name: "__Droppeth", type: "Actor" })
        );
    }

    getLightSource(item?: PhysicalItemPF2e) {
        const itemRules =
            this.settings.light && item && item.quantity > 0 ? item.system.rules : undefined;
        const lightRule = itemRules?.find(
            (rule): rule is TokenLightRuleElement => rule.key === "TokenLight"
        );
        return new foundry.data.LightData(lightRule?.value as foundry.data.LightSource).toObject();
    }

    #actorOnEmbeddedDocumentChange(actor: ActorPF2e, wrapped: libWrapper.RegisterCallback) {
        wrapped();

        if (!this.isDroppethActor(actor) || !isPrimaryUpdater(actor)) return;

        (async () => {
            const token = this.getDroppethToken(actor);

            if (actor.inventory.size === 0) {
                token?.delete();
                return;
            }

            const onlyItem = R.pipe(
                actor.inventory.contents,
                R.filter((item) => !item.isInContainer),
                R.only()
            );

            const { img, name } = onlyItem ?? DroppethTool.DEFAULT_DATA;

            const tokenUpdate: DeepPartial<TokenDocumentPF2e["_source"]> = {
                name,
                texture: {
                    src: img,
                },
                light: this.getLightSource(onlyItem),
            };

            await actor.update({ img, name });
            await token?.update(tokenUpdate);
        })();
    }

    #onDeleteToken(token: TokenDocumentPF2e) {
        const actor = this.getDroppethActor(token);
        actor?.delete();
    }

    #onDropCanvasData(canvas: CanvasPF2e, data: DropCanvasData): boolean {
        if (data.type !== "Item" || !R.isString(data.uuid)) {
            return true;
        }

        const item = fromUuidSync<ItemPF2e>(data.uuid);
        if (!item || !itemIsOfType(item, "physical")) {
            return true;
        }

        (async () => {
            const options: DroppethOptions = {
                item,
                x: data.x,
                y: data.y,
            };

            if (!(item instanceof Item) || item.pack) {
                this.#droppethItemEmitable.call(options);
                return;
            }

            const tradeData = await initiateTrade(item, {
                title: this.localize("dialog.title"),
                prompt: this.localize("dialog.prompt"),
            });

            if (tradeData) {
                options.quantity = tradeData.quantity;
                this.#droppethItemEmitable.call(options);
            }
        })();

        return false;
    }

    async #droppethItem({ item, quantity, x, y }: DroppethOptions, userId: string) {
        const scene = canvas.scene;
        if (!scene) {
            this.error("error.no-scene");
            return;
        }

        const tradeData = getTradeData(item, quantity);
        if (!tradeData) {
            this.error("error.unknown");
            return;
        }

        const folder = await this.getDroppethFolder();

        const tokenId = foundry.utils.randomID();
        const tokenUuid = `${scene.uuid}.Token.${tokenId}`;
        const { name, img } = item;

        const actorSource: PreCreate<LootSource> = {
            type: "loot",
            name,
            folder: folder?.id,
            items: [tradeData.itemSource, ...tradeData.contentSources],
            img,
            ownership: {
                default: 3,
                [userId]: 3,
            },
        };

        this.setFlagProperties(actorSource, { temporary: true, tokenUuid });

        const actor = (await getDocumentClass("Actor").create(actorSource, {
            keepEmbeddedIds: true,
        })) as LootPF2e | undefined;
        const mainItem = actor?.inventory.find((x) => x.id === tradeData.itemSource._id);

        if (!actor || !mainItem) {
            this.error("error.unknown");
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
            light: this.getLightSource(item),
        };

        const tokenDocument = await actor.getTokenDocument(tokenSource, { parent: scene });
        const token = canvas.tokens.createObject(
            // @ts-expect-error
            tokenDocument
        );

        const position = positionTokenFromCoords({ x, y }, token);

        token.destroy({ children: true });
        tokenDocument.updateSource(position);

        if (!canvas.dimensions.rect.contains(tokenDocument.x, tokenDocument.y)) {
            this.error("error.out-of-bounds");
            await actor.delete();
            return;
        }

        canvas.tokens.activate();
        await getDocumentClass("Token").create(
            // @ts-expect-error
            tokenDocument,
            { parent: canvas.scene, keepId: true }
        );

        // no source actor so no update or message needed
        if (!item.actor) return;

        await updateTradedItemSource(item as PhysicalItemPF2e<ActorPF2e>, tradeData);

        createTradeMessage({
            item: mainItem,
            message: this.localizePath(
                "message.content",
                tradeData.contentSources.length ? "container" : "item"
            ),
            source: item.actor,
            subtitle: this.localize("message.subtitle"),
            quantity: tradeData.giveQuantity,
            userId,
        });
    }
}

async function initiateTrade(
    item: PhysicalItemPF2e,
    { prompt, targetActor, title }: InitiateTradeOptions = {}
): Promise<MoveLootFormData | null> {
    if (item.quantity <= 0) {
        return null;
    }

    if (item.isOfType("backpack") || item.quantity === 1) {
        return { quantity: 1, newStack: false, isPurchase: false };
    }

    return new ItemTransferDialog(item, {
        targetActor,
        lockStack: !targetActor?.inventory.findStackableItem(item._source),
        title,
        prompt,
        button: title,
    }).resolve();
}

type InitiateTradeOptions = {
    targetActor?: ActorPF2e;
    title?: string;
    prompt?: string;
};

type DroppethOptions = {
    item: PhysicalItemPF2e;
    x: number;
    y: number;
    quantity?: number;
};

type ToolSettings = {
    enabled: boolean;
    light: boolean;
};

export { DroppethTool };
