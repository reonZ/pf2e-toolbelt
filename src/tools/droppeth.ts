import {
    DropCanvasData,
    Emitable,
    ImageFilePath,
    isPrimaryUpdater,
    itemIsOfType,
    ItemUUID,
    KeybindingActionConfig,
    positionTokenFromCoords,
    R,
    SYSTEM,
    ToggleableHook,
    ToggleableKeybind,
    ToggleableWrapper,
    userIsGM,
} from "foundry-helpers";
import {
    ActorPF2e,
    CanvasPF2e,
    ItemPF2e,
    LootPF2e,
    LootSource,
    PhysicalItemPF2e,
    PhysicalItemType,
    TokenDocumentPF2e,
    TokenLightRuleElement,
} from "foundry-pf2e";
import { ModuleTool, ToolSettingsList } from "module-tool";
import { createTradeMessage, createTradeQuantityDialog, TradeQuantityDialogData } from ".";

export class DroppethTool extends ModuleTool<ToolSettings> {
    #deleteTokenHook = new ToggleableHook("deleteToken", this.#onDeleteToken.bind(this));
    #dropCanvasDataHook = new ToggleableHook("dropCanvasData", this.#onDropCanvasData.bind(this));

    #droppethItemEmitable = new Emitable(this.key, this.#droppethItem, this);

    #onEmbeddedDocumentChangeWrapper = new ToggleableWrapper(
        "WRAPPER",
        "CONFIG.Actor.documentClass.prototype._onEmbeddedDocumentChange",
        this.#actorOnEmbeddedDocumentChange,
        { context: this },
    );

    #droppethKeybind = new ToggleableKeybind({
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
            img: SYSTEM.relativePath("icons/default-icons/backpack.svg"),
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
                onChange: () => {
                    this._configurate();
                },
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

    get api(): Record<string, any> {
        return {
            droppethRequest: (options: DroppethOptions) => {
                this.#droppethItemEmitable.call(options);
            },
        };
    }

    _configurate(): void {
        const enabled = this.settings.enabled;

        this.#droppethKeybind.toggle(enabled);

        if (userIsGM()) {
            this.#deleteTokenHook.toggle(enabled);
            this.#droppethItemEmitable.toggle(enabled);
            this.#onEmbeddedDocumentChangeWrapper.toggle(enabled);
        }
    }

    ready(): void {
        this._configurate();
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
        const itemRules = this.settings.light && item && item.quantity > 0 ? item.system.rules : undefined;
        const lightRule = itemRules?.find((rule): rule is TokenLightRuleElement => rule.key === "TokenLight");
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
                R.only(),
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

    #onDropCanvasData(_canvas: CanvasPF2e, data: DropCanvasData): boolean {
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

            const tradeData = await this.#initiateTrade(item);

            if (tradeData) {
                options.quantity = tradeData.quantity;
                this.#droppethItemEmitable.call(options);
            }
        })();

        return false;
    }

    async #droppethItem(options: DroppethOptions, userId: string) {
        const error = (err: string) => {
            this.notify.error(`error.${err}`);
        };

        const scene = canvas.scene;

        if (!scene) {
            return error("no-scene");
        }

        const item = options.item instanceof Item ? options.item : await fromUuid<PhysicalItemPF2e>(options.item.uuid);

        if (!item) {
            return error("unknown");
        }

        const allowedQuantity = item.quantity;

        if (allowedQuantity < 1) {
            return error("quantity");
        }

        const owner = item.actor;
        const folder = await this.getDroppethFolder();
        const tokenId = foundry.utils.randomID();
        const tokenUuid = `${scene.uuid}.Token.${tokenId}`;
        const { name, img } = item;

        const actorSource: PreCreate<LootSource> = {
            type: "loot",
            name,
            folder: folder?.id,
            img,
            // item has no owner or is from the compendium so we add the source directly
            items: !owner || item.pack ? [item.toObject()] : undefined,
            ownership: {
                default: 3,
                [userId]: 3,
            },
        };

        this.setFlagProperties(actorSource, { temporary: true, tokenUuid });

        const actor = (await getDocumentClass("Actor").create(actorSource)) as LootPF2e | undefined;

        if (!actor) {
            return error("actor");
        }

        // we transfer the item from its owner to the newly created droppeth actor
        if (owner) {
            await item.actor?.transferItemToActor(actor, item as PhysicalItemPF2e<ActorPF2e>, options.quantity ?? 1);
        }

        // we recover the main item (which is added first if container and its content)
        const mainItem = actor.inventory.contents[0];

        if (!mainItem) {
            await actor.delete();
            return error("unknown");
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
        const token = canvas.tokens.createObject(tokenDocument as any);
        const position = positionTokenFromCoords({ x: options.x, y: options.y }, token);

        token.destroy({ children: true });
        tokenDocument.updateSource(position);

        if (!canvas.dimensions.rect.contains(tokenDocument.x, tokenDocument.y)) {
            this.notify.error("error.out-of-bounds");
            await actor.delete();
            return;
        }

        canvas.tokens.activate();
        await getDocumentClass("Token").create(tokenDocument as any, { parent: canvas.scene, keepId: true });

        // no source actor so no exchange message needed
        if (!owner) return;

        createTradeMessage({
            item: mainItem,
            message: this.localize.path("message.content", actor.inventory.size > 1 ? "container" : "item"),
            source: owner,
            subtitle: this.localize("message.subtitle"),
            quantity: mainItem.quantity,
            userId,
        });
    }

    async #initiateTrade(item: PhysicalItemPF2e): Promise<TradeQuantityDialogData | null> {
        if (item.quantity <= 0) {
            return null;
        }

        if (item.isOfType("backpack") || item.quantity === 1) {
            return { quantity: 1, newStack: false };
        }

        return createTradeQuantityDialog({
            button: {
                action: "droppeth",
                icon: "fa-solid fa-arrow-down-to-bracket",
                label: this.localize("dialog.button"),
            },
            item,
            prompt: this.localize("dialog.prompt"),
            title: this.localize("dialog.title", { item: item.name }),
        });
    }
}

type DroppethOptions = {
    item: PhysicalItemPF2e | { type: PhysicalItemType; uuid: ItemUUID };
    x: number;
    y: number;
    quantity?: number;
};

type ToolSettings = {
    enabled: boolean;
    light: boolean;
};
