import {
    ActorPF2e,
    CanvasPF2e,
    createEmitable,
    createToggleHook,
    createToggleWrapper,
    DropCanvasData,
    htmlQuery,
    ImageFilePath,
    isMerchant,
    isPrimaryUpdater,
    itemCheckedValue,
    itemIsCredits,
    itemIsOfType,
    ItemPF2e,
    ItemUUID,
    LootPF2e,
    LootSource,
    PhysicalItemPF2e,
    PhysicalItemType,
    positionTokenFromCoords,
    R,
    SYSTEM,
    TokenDocumentPF2e,
    TokenLightRuleElement,
    userIsGM,
} from "foundry-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";
import { createTradeMessage, createTradeQuantityDialog, TradeQuantityDialogOptions } from ".";

class DroppethTool extends ModuleTool<ToolSettings> {
    #deleteTokenHook = createToggleHook("deleteToken", this.#onDeleteToken.bind(this));
    #dropCanvasDataHook = createToggleHook("dropCanvasData", this.#onDropCanvasData.bind(this), { upstream: true });

    #droppethItemEmitable = createEmitable(this.path("droppeth"), this.#droppethItem.bind(this));
    #tradeItemEmitable = createEmitable(this.path("trade"), transferItemToActor);

    #onEmbeddedDocumentChangeWrapper = createToggleWrapper(
        "WRAPPER",
        "CONFIG.PF2E.Actor.documentClasses.loot.prototype._onEmbeddedDocumentChange",
        this.#actorOnEmbeddedDocumentChange,
        { context: this },
    );

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

    get api(): Record<string, any> {
        return {
            droppethRequest: (options: DroppethOptions) => {
                this.#droppethItemEmitable.call(options);
            },
        };
    }

    _configurate(): void {
        const enabled = this.settings.enabled;

        this.#dropCanvasDataHook.toggle(enabled);

        if (userIsGM()) {
            this.#deleteTokenHook.toggle(enabled);
            this.#droppethItemEmitable.toggle(enabled);
            this.#onEmbeddedDocumentChangeWrapper.toggle(enabled);
            this.#tradeItemEmitable.toggle(enabled);
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
        return uuid ? (fromUuidSync(uuid, { strict: false }) as TokenDocumentPF2e) : null;
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

    #actorOnEmbeddedDocumentChange(actor: LootPF2e, wrapped: libWrapper.RegisterCallback) {
        wrapped();

        if (!isPrimaryUpdater(actor)) return;

        (async () => {
            const token = this.getDroppethToken(actor);
            const inventory = actor.inventory.contents;

            // we didn't allow droppeth of items with 0 qty, so we shouldn't allow them to remain
            if (inventory.length === 0 || (inventory.length === 1 && itemCheckedValue(inventory[0]) <= 0)) {
                token?.delete();
                return;
            }

            const onlyItem = R.pipe(
                inventory,
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

    #onDropCanvasData(_canvas: CanvasPF2e, data: DropCanvasData, event: DragEvent): boolean {
        if (data.type !== "Item" && data.type !== "PersistentDamage") return true;

        const item = R.isString(data.uuid) && fromUuidSync<ItemPF2e>(data.uuid, { strict: false });
        if (!item || !itemIsOfType(item, "physical")) return true;

        this.#initiateDroppeth(item, event, data);
        return false;
    }

    async #droppethItem(options: DroppethOptions, userId: string) {
        const error = (err: string) => {
            this.localize.error("error", err);
        };

        const scene = canvas.scene;

        if (!scene) {
            return error("no-scene");
        }

        const item = options.item instanceof Item ? options.item : await fromUuid<PhysicalItemPF2e>(options.item.uuid);

        if (!item) {
            return error("unknown");
        }

        const checkedValue = itemCheckedValue(item);
        if (checkedValue < 1) {
            return error("quantity");
        }

        const owner = getValidOwner(item);
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
            items: !owner ? [item.toObject()] : undefined,
            ownership: {
                default: 3,
                [userId]: 3,
            },
            system: {
                _migration: {
                    version: game.settings.get(SYSTEM.id, "worldSchemaVersion"),
                },
            },
        };

        this.setFlagProperties(actorSource, { temporary: true, tokenUuid });

        const actor = (await getDocumentClass("Actor").create(actorSource)) as LootPF2e | undefined;

        if (!actor) {
            return error("actor");
        }

        // we transfer the item from its owner to the newly created droppeth actor
        if (owner) {
            await transferItemToActor({ ...options, item, target: actor });
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
            level: canvas.level?.id,
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
            this.localize.error("error.out-of-bounds");
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

    async #initiateDroppeth(item: PhysicalItemPF2e, event: DragEvent, data: DropCanvasData) {
        const { x, y } = data;
        const owner = item.actor;
        const checkedValue = itemCheckedValue(item);
        const targetActor = canvas.tokens.quadtree
            .getObjects(new PIXI.Rectangle(x, y))
            .values()
            .toArray()
            .sort((a, b) => b.document.elevation - a.document.elevation || b.document.sort - a.document.sort)
            .find((t) => t.visible)?.actor;

        // we don't want to droppeth an item with 0 qty
        if (!targetActor && checkedValue <= 0) {
            return this.localize.warning("error.quantity");
        }

        // merchants & droppeth actors do not droppeth if there is a target
        if (targetActor && (checkedValue <= 0 || isMerchant(owner) || this.isDroppethActor(owner))) {
            const dataTransfer = new DataTransfer();
            dataTransfer.setData("text/plain", JSON.stringify(data));

            const newEvent = new DragEvent("drop", {
                altKey: event.altKey,
                shiftKey: event.shiftKey,
                dataTransfer,
            });

            return targetActor.sheet._onDrop(newEvent);
        }

        const droppethOptions: DroppethOptions = {
            item,
            quantity: 1,
            x,
            y,
        };

        const hasMultiple = checkedValue > 1;

        // we don't need to ask, straight forward droppeth it is
        if (!targetActor && (!owner || !hasMultiple || item.isOfType("backpack"))) {
            return this.#droppethItemEmitable.call(droppethOptions);
        }

        const stackable = !!targetActor?.inventory.findStackableItem(item._source);
        const buttons: TradeQuantityDialogOptions<"droppeth" | "trade">["buttons"] = [
            {
                action: "droppeth",
                icon: "fa-solid fa-arrow-down-to-bracket",
                label: this.localize.path("dialog.button"),
            },
        ];

        if (targetActor) {
            buttons.push({
                action: "trade",
                icon: "fa-solid fa-gift",
                label: this.localize.path("dialog.mixed.button"),
            });
        }

        const result = await createTradeQuantityDialog({
            buttons,
            item,
            lockStack: !stackable,
            prompt: this.localize("dialog", !targetActor ? "prompt" : hasMultiple ? "mixed.multi" : "mixed.single"),
            render: (html) => {
                if (!targetActor || hasMultiple) return;

                const nameEl = htmlQuery(html, ".transfer-data .name");
                const groupEl = nameEl?.nextElementSibling;

                if (nameEl && groupEl instanceof HTMLElement) {
                    nameEl.style.gridRow = "1 / -1";
                    nameEl.style.marginBlock = "auto";

                    groupEl.style.display = "none";
                }
            },
            title: this.localize(targetActor ? "dialog.mixed.title" : "dialog.title", { item: item.name }),
        });

        if (!result) return;

        if (result.action === "droppeth") {
            droppethOptions.quantity = result.quantity;
            return this.#droppethItemEmitable.call(droppethOptions);
        }

        if (!targetActor) return;

        if (gmMustTransfer(item, targetActor)) {
            this.#tradeItemEmitable.emit({ item, target: targetActor, ...R.pick(result, ["newStack", "quantity"]) });
        } else {
            transferItemToActor({ ...result, item, target: targetActor });
        }
    }
}

function getValidOwner(item: PhysicalItemPF2e): ActorPF2e | null {
    return item.pack ? null : item.actor;
}

function gmMustTransfer(item: PhysicalItemPF2e, target: ActorPF2e): boolean {
    const bothAreOwned = item.isOwner && target.isOwner;
    if (bothAreOwned) return false;

    const source = getValidOwner(item);
    const sourceIsOwnedOrLoot = !source || source.isLootableBy(game.user);
    const targetIsOwnedOrLoot = target.isLootableBy(game.user);

    return sourceIsOwnedOrLoot && targetIsOwnedOrLoot;
}

async function transferItemToActor({ item, quantity = 1, newStack, target }: TradeOptions): Promise<void> {
    const owner = getValidOwner(item);

    if (!itemIsCredits(item) || (item.system.slug !== "credstick" && quantity >= item.system.price.value.credits)) {
        if (owner) {
            await owner.transferItemToActor(target, item as PhysicalItemPF2e<ActorPF2e>, quantity, undefined, newStack);
        } else {
            const source = item.toObject();
            await target.createEmbeddedDocuments("Item", [source]);
        }
        return;
    }

    const credits = Math.min(quantity, item.system.price.value.credits);
    await target.inventory.addCurrency({ credits });

    if (owner) {
        const newPrice = new game.pf2e.Coins({ credits: item.system.price.value.credits - credits }).toObject();
        await item.update({ "system.price.value": _replace(newPrice) });
    }
}

type TradeOptions = {
    item: PhysicalItemPF2e;
    newStack?: boolean;
    quantity?: number;
    target: ActorPF2e;
};

type DroppethOptions = {
    item: PhysicalItemPF2e | { type: PhysicalItemType; uuid: ItemUUID };
    quantity: number;
    x: number;
    y: number;
};

type ToolSettings = {
    enabled: boolean;
    light: boolean;
};

export { DroppethTool };
