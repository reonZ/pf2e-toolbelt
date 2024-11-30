import {
    ActorPF2e,
    ActorSheetPF2e,
    ActorType,
    addListenerAll,
    advanceTime,
    ApplicationClosingOptions,
    ApplicationConfiguration,
    ApplicationRenderContext,
    ApplicationRenderOptions,
    CharacterPF2e,
    confirmDialog,
    createHTMLElement,
    DateTime,
    elementDataset,
    getItemIdentificationDCs,
    getShortDateTime,
    htmlClosest,
    htmlQuery,
    htmlQueryAll,
    IdentifyItemPopup,
    ItemPF2e,
    MagicTradition,
    PhysicalItemPF2e,
    PhysicalItemType,
    promptDialog,
    R,
    userIsActiveGM,
} from "module-helpers";
import { createTool } from "../tool";

const PARTIAL_SLUGH_REGEX = / ?\(.+\) ?/g;

const EIDOLON_ICON = "fa-solid fa-alien";
const COMPANION_ICON = "fa-solid fa-dog";

const ACTOR_TYPE_ICONS: Record<ActorType, string> = {
    familiar: "fa-solid fa-bat",
    loot: "fa-solid fa-treasure-chest",
    vehicle: "fa-solid fa-wagon-covered",
    npc: "fa-solid fa-ghost",
    character: "fa-solid fa-user",
    party: "fa-solid fa-users",
    army: "",
    hazard: "",
};

const { config, settings, localize, hook, socket, render, getFlag, flagPath } = createTool({
    name: "identify",
    settings: [
        {
            key: "enabled",
            type: Boolean,
            default: false,
            scope: "world",
            onChange: (enabled: boolean) => {
                const isGM = game.user.isGM;
                const playerRequest = settings.playerRequest;

                hook.toggle(enabled && (isGM || playerRequest));
                socket.toggle(enabled && isGM && playerRequest);

                if (enabled) refreshTracker();
                else closeTracker();
            },
        },
        {
            key: "stash",
            type: Boolean,
            default: true,
            scope: "world",
            onChange: (value: boolean) => {
                refreshTracker(!value);
            },
        },
        {
            key: "delay",
            type: Boolean,
            default: false,
            scope: "world",
            onChange: () => {
                refreshTracker();
            },
        },
        {
            key: "identifyPartials",
            type: Boolean,
            default: true,
            scope: "world",
        },
        {
            key: "playerRequest",
            type: Boolean,
            default: true,
            scope: "world",
            onChange: (value: boolean) => {
                const isGM = game.user.isGM;
                const enabled = settings.enabled;

                hook.toggle(enabled && (isGM || value));
                socket.toggle(enabled && isGM && value);
            },
        },
    ],
    hooks: [
        {
            event: "renderActorSheetPF2e",
            listener: onRenderActorSheetPF2e,
        },
    ],
    api: {
        openTracker,
        requestIdentify,
    },
    onSocket: async (packet: SocketPacket, userId: string) => {
        if (userIsActiveGM()) {
            onRequestReceived(packet.itemUUID, userId);
        }
    },
    init: (isGM) => {
        if (!settings.enabled) return;

        const playerRequest = settings.playerRequest;

        if (isGM || playerRequest) hook.activate();
        if (isGM && playerRequest) socket.activate();
    },
} as const);

async function onRequestReceived(itemUUID: string, userId: string) {
    const user = game.users.get(userId);
    const item = await fromUuid<ItemPF2e>(itemUUID);
    if (!user || !item?.isOfType("physical")) return;

    const confirm = await confirmDialog({
        title: user.name,
        content: await render("request", { item: item.system.identification.identified }),
    });

    if (confirm) {
        openTracker(item);
    }
}

function onRenderActorSheetPF2e(sheet: ActorSheetPF2e<ActorPF2e>) {
    const user = game.user;
    const isGM = user.isGM;
    const actor = sheet.actor;

    if (!isGM && actor.isOfType("loot") && actor.isMerchant) return;
    if (!(actor as Actor).canUserModify(user, "update")) return;

    const listElement = htmlQuery(sheet.element[0], ".inventory-list");
    if (!listElement) return;

    const itemsElements = listElement.querySelectorAll<HTMLLIElement>(
        "li[data-item-id],li[data-subitem-id]"
    );

    for (const itemElement of itemsElements) {
        const { itemId, subitemId } = itemElement.dataset;
        const realItemId = subitemId
            ? htmlClosest(itemElement, "[data-item-id]")?.dataset.itemId
            : itemId;
        const realItem = (actor as ActorPF2e).inventory.get(realItemId, { strict: true });
        const item = subitemId ? realItem.subitems.get(subitemId, { strict: true }) : realItem;

        if (item.isIdentified) continue;

        if (isGM) {
            const systemToggle = htmlQuery(itemElement, "[data-action='toggle-identified']");
            systemToggle?.remove();
        }

        const toggleElement = createHTMLElement("a", {
            dataset: {
                action: "pf2e-toobelt-identify",
                tooltip: "PF2E.identification.Identify",
            },
            innerHTML: "<i class='fa-solid fa-question-circle fa-fw'></i>",
        });

        const dataElement = htmlQuery(itemElement, ".data");
        if (!dataElement) return;

        const siblingElement = htmlQuery(
            dataElement,
            `[data-action="${isGM ? "edit-item" : "delete-item"}"]`
        );
        if (siblingElement) {
            siblingElement.before(toggleElement);
        } else {
            const imgElement = htmlQuery(dataElement, ".item-image");
            imgElement?.after(toggleElement);
        }

        toggleElement.addEventListener("click", () => {
            if (game.user.isGM) {
                openTracker(item);
            } else {
                requestIdentify(item);
            }
        });
    }
}

function requestIdentify(item: ItemPF2e, skipNotify?: boolean) {
    if (!skipNotify) localize.info("request.sent");
    socket.emit({ itemUUID: item.uuid });
}

class PF2eToolbeltIdentify extends foundry.applications.api.ApplicationV2 {
    static instance: PF2eToolbeltIdentify | null = null;

    #HOOKS: [string, HookCallback<any>][] = [
        ["updateWorldTime", () => this.render()],
        ["updateActor", this.#onActorUpdate.bind(this)],
        ["updateItem", this.#onItemUpdate.bind(this)],
        ["deleteItem", this.#onItemUpdate.bind(this)],
        ["createItem", this.#onItemUpdate.bind(this)],
    ];

    #unlockedUUIDs: ItemUUID[] = [];
    #loading = false;
    #knownItems: { uuid: ItemUUID; partial: boolean }[] = [];
    #itemsUUIDs: ItemUUID[] = [];
    #removedFaillures: Record<string, Set<string>> = {};
    #updates: Record<string, Record<string, "success" | "fail">> = {};

    constructor(item?: ItemPF2e, options: DeepPartial<ApplicationConfiguration> = {}) {
        options.id = localize("tracker");
        options.window ??= {};
        options.window.title = localize("tracker.title");

        super(options);

        if (this.isValidItem(item)) {
            this.#unlockedUUIDs.push(item.uuid);
        }
    }

    async _prepareContext(options: IdentifyRenderOptions): Promise<IdentifyContext> {
        const party = game.actors.party;
        const members = party?.members ?? [];
        const characters = members.filter((actor): actor is CharacterPF2e =>
            actor.isOfType("character")
        );
        const identifications: Record<string, IdenfifiedFlag> = {};
        const spellLists: Record<string, IdentifySpellList> = {};
        const itemGroups: Partial<Record<PhysicalItemType, IdentifyGroupItem[]>> = {};

        const useDelay = settings.delay;
        const { worldTime, date, time } = getShortDateTime();

        for (const actor of characters) {
            identifications[actor.id] = getFlag<IdenfifiedFlag>(actor, "identified") ?? {};
        }

        const items: PhysicalItemPF2e<ActorPF2e>[] = R.pipe(
            members,
            R.flatMap((actor) => actor.inventory.contents),
            R.filter((item) => !item.isIdentified)
        );

        if (party && settings.stash) {
            items.push(...party.inventory.contents.filter((item) => !item.isIdentified));
        }

        const ghostItems = R.pipe(
            await Promise.all(
                R.pipe(
                    [...this.#itemsUUIDs, ...this.#unlockedUUIDs],
                    R.unique(),
                    R.difference(items.map((item) => item.uuid)),
                    R.map((uuid) => fromUuid<PhysicalItemPF2e<ActorPF2e>>(uuid))
                )
            ),
            R.filter(R.isTruthy),
            R.filter((item) => this.isValidItem(item))
        );

        const allItems = [...items, ...ghostItems];
        const hasLockedItems = this.#unlockedUUIDs.length > 0;

        this.#knownItems = [];
        this.#removedFaillures = {};
        this.#itemsUUIDs = allItems.map((item) => item.uuid);

        for (const item of allItems) {
            const itemUuid = item.uuid;
            const itemActor = item.actor;
            const itemIdentified = item.isIdentified;
            const data = item.system.identification.identified;
            const isConsumable = item.isOfType("consumable");
            const scrollWandSpell =
                isConsumable && ["wand", "scroll"].includes(item.category) && item.embeddedSpell;
            const itemTraditions =
                scrollWandSpell && scrollWandSpell.rarity === "common"
                    ? scrollWandSpell.traditions
                    : undefined;
            const itemSlug = scrollWandSpell
                ? scrollWandSpell.slug ?? game.pf2e.system.sluggify(scrollWandSpell.name)
                : item.slug ?? game.pf2e.system.sluggify(data.name);
            const partialSlug =
                isConsumable && !scrollWandSpell
                    ? game.pf2e.system.sluggify(data.name.replace(PARTIAL_SLUGH_REGEX, ""))
                    : undefined;
            const fails = getFlag<IdentifyFailedFlag>(item, "failed") ?? {};
            const isLocked =
                !itemIdentified && hasLockedItems && !this.#unlockedUUIDs.includes(itemUuid);

            const itemClasses: (string | boolean)[] = [
                itemIdentified && "identified",
                isLocked && "locked",
            ];

            const ownerIcon = (() => {
                const actorType = itemActor.type as ActorType;
                if (actorType !== "character") return ACTOR_TYPE_ICONS[actorType];

                const traits = itemActor.traits;

                return traits.has("eidolon")
                    ? EIDOLON_ICON
                    : traits.has("minion")
                    ? COMPANION_ICON
                    : ACTOR_TYPE_ICONS.character;
            })();

            const owner = {
                name: itemActor.name,
                id: itemActor.id,
                icon: ownerIcon,
            };

            const identifyTooltip = await (async () => {
                if (itemIdentified) return;

                const isAlchemical = item.isAlchemical;
                const dcs = getItemIdentificationDCs(item);
                const tmp = await renderTemplate(
                    "systems/pf2e/templates/actors/identify-item.hbs",
                    {
                        dcs: !isAlchemical && "crafting" in dcs ? { dc: dcs.crafting } : dcs,
                        isMagic: item.isMagical,
                        isAlchemical,
                    }
                );

                const element = createHTMLElement("div", { innerHTML: tmp });
                const rows = element.querySelectorAll("tr");

                let tooltip = `<h3>${game.i18n.localize("PF2E.identification.Identify")}</h3>`;
                tooltip += `<div class="grid">`;

                for (const row of rows) {
                    const skill = htmlQuery(row, "th")?.innerText;
                    const dc = htmlQuery(row, "td")?.innerText;

                    tooltip += `<div>${skill}</div><div>${dc}</div>`;
                }

                tooltip += "</div>";

                return tooltip;
            })();

            const itemType = item.type as PhysicalItemType;
            const itemGroup = (itemGroups[itemType] ??= []);

            itemGroup.push({
                itemSlug,
                isLocked,
                partialSlug,
                img: data.img,
                uuid: itemUuid,
                name: data.name,
                owner,
                identifyTooltip,
                css: itemClasses.join(" "),
                isIdentified: itemIdentified,
                actors: characters.map((actor): ItemActor | { id: string } => {
                    const actorId = actor.id;

                    if (itemIdentified) return { id: actorId };

                    const failed = (() => {
                        const fail = fails[actorId];
                        if (!fail) return 0;

                        const failTime = DateTime.fromISO(fail);
                        const diffTime = worldTime.diff(failTime, useDelay ? "hours" : "days");
                        const removeFail = useDelay ? diffTime.hours >= 24 : diffTime.days >= 1;

                        if (removeFail) {
                            const toRemove = (this.#removedFaillures[itemUuid] ??= new Set());
                            toRemove.add(actorId);
                        }

                        return removeFail ? 0 : useDelay ? 24 - diffTime.hours : 1;
                    })();

                    const known = (() => {
                        if (failed) return false;

                        const identification = identifications[actorId]?.[itemType] ?? [];
                        const full = identification.find((x) => x.itemSlug === itemSlug);

                        if (full) return true;

                        if (partialSlug) {
                            const partial = identification.find(
                                (x) => x.partialSlug === partialSlug
                            );
                            if (partial?.itemName) {
                                return partial.itemName;
                            }
                        }

                        return false;
                    })();

                    if (known !== false) {
                        this.#knownItems.push({
                            uuid: itemUuid,
                            partial: typeof known === "string",
                        });
                    }

                    const canRecallKnowledge = (() => {
                        if (failed || known !== false || !scrollWandSpell) return false;

                        const list = (spellLists[actorId] ??= getSpellList(actor));
                        const isTradition =
                            !!itemTraditions &&
                            list.traditions.some((tradition) => itemTraditions.has(tradition));

                        return isTradition || list.known.includes(itemSlug);
                    })();

                    const tooltip = failed
                        ? useDelay
                            ? localize("tracker.failed.delay", { hours: failed })
                            : localize("tracker.failed.daily")
                        : typeof known === "string"
                        ? localize("tracker.known.partial", { item: known })
                        : known === true
                        ? localize("tracker.known.full")
                        : canRecallKnowledge
                        ? localize("tracker.known.recall")
                        : "";

                    const update =
                        !failed && known !== true ? this.#updates[itemUuid]?.[actorId] : undefined;

                    const canToggle = !itemIdentified && !failed && known !== true;

                    const actorClasses: (string | false)[] = [
                        failed !== 0 && "failed",
                        canToggle && "toggleable",
                    ];

                    return {
                        id: actorId,
                        known,
                        update,
                        tooltip,
                        canToggle,
                        canRecallKnowledge,
                        failed: failed !== 0,
                        css: actorClasses.join(" "),
                    };
                }),
            });
        }

        return {
            time,
            date,
            actors: characters,
            itemGroups: R.pipe(
                R.entries(itemGroups),
                R.map(([type, items]) => ({
                    type,
                    label: game.i18n.localize(`TYPES.Item.${type}`),
                    items: R.sortBy(items, R.prop("name")),
                })),
                R.sortBy(R.prop("label"))
            ),
        };
    }

    _onFirstRender(context: ApplicationRenderContext, options: IdentifyRenderOptions) {
        for (const [event, callback] of this.#HOOKS) {
            Hooks.on(event, callback);
        }
    }

    async _renderHTML(context: IdentifyContext, options: IdentifyRenderOptions) {
        return render("tracker", context);
    }

    _replaceHTML(result: string, content: HTMLElement, options: IdentifyRenderOptions) {
        const prevChild = content.firstElementChild;
        const scrollEl = htmlQuery(prevChild, ".items");
        const scrollPos = scrollEl ? { left: scrollEl.scrollLeft, top: scrollEl.scrollTop } : null;

        const newChildren = createHTMLElement("div", { innerHTML: result }).children;

        if (prevChild) content.replaceChildren(...newChildren);
        else content.append(...newChildren);

        if (scrollPos) {
            const scrollEl = htmlQuery(content, ".items")!;
            scrollEl.scrollLeft = scrollPos.left;
            scrollEl.scrollTop = scrollPos.top;
        }

        this.#activateListeners(content);
    }

    _onClose(options: ApplicationClosingOptions): void {
        PF2eToolbeltIdentify.instance = null;
        for (const [event, callback] of this.#HOOKS) {
            Hooks.off(event, callback);
        }
    }

    async render(options?: boolean | IdentifyRenderOptions, _options?: ApplicationRenderOptions) {
        if (this.#loading) return this;

        if (typeof options === "object" && options.fullReset) {
            this.#itemsUUIDs = [];
            this.#reset();
        }

        return super.render(options, _options);
    }

    isValidItem(item?: ItemPF2e): item is PhysicalItemPF2e<ActorPF2e> {
        return item instanceof Item && item.isOfType("physical") && !!item.actor;
    }

    unlockItem(itemOrUUID: ItemPF2e | ItemUUID) {
        const itemUUID =
            typeof itemOrUUID === "string"
                ? itemOrUUID
                : this.isValidItem(itemOrUUID)
                ? itemOrUUID.uuid
                : undefined;

        if (!itemUUID || this.#unlockedUUIDs.includes(itemUUID)) return;

        const hadLockedItems = this.#unlockedUUIDs.length > 0;

        this.#unlockedUUIDs.push(itemUUID);

        if (!hadLockedItems || !this.#itemsUUIDs.includes(itemUUID)) {
            return this.render();
        }

        const elements = this.element.querySelectorAll(`[data-item-uuid="${itemUUID}"]`);

        for (const element of elements) {
            element.classList.remove("locked");
        }
    }

    #reset() {
        this.#updates = {};
        this.render();
    }

    #setLoading(enabled: boolean) {
        this.#loading = enabled;
        this.element.classList.toggle("loading", enabled);
    }

    #onActorUpdate(actor: ActorPF2e) {
        if (actor === game.actors.party) {
            this.render();
        }
    }

    #onItemUpdate(item: ItemPF2e) {
        if (this.isValidItem(item)) {
            this.render();
        }
    }

    #activateListeners(html: HTMLElement) {
        addListenerAll(html, ".highlight", "mouseenter", (event, el) => {
            if (el.classList.contains("locked")) return;

            const { itemUuid, actorId } = el.dataset;

            const cells: Element[] = [];

            if (actorId) {
                const actorCells = html.querySelectorAll(`.highlight[data-actor-id="${actorId}"]`);
                cells.push(...actorCells);
            }

            if (itemUuid) {
                const itemCells = html.querySelectorAll(`.highlight[data-item-uuid="${itemUuid}"]`);
                cells.push(...itemCells);
            }

            for (const cell of cells) {
                cell.classList.add("highlighted");
            }
        });

        addListenerAll(html, ".highlight", "mouseleave", (event, el) => {
            const cells = html.querySelectorAll(".highlighted");

            for (const cell of cells) {
                cell.classList.remove("highlighted");
            }
        });

        addListenerAll(html, ".item-img, .item-details", (event, el) => {
            const { itemUuid } = elementDataset<IdentifyCellData>(el);

            if (el.classList.contains("locked")) {
                this.unlockItem(itemUuid);
                return;
            }
        });

        addListenerAll(html, ".item-actor", "mousedown", (event, el) => {
            if (![0, 2].includes(event.button)) return;

            const { itemUuid, actorId } = elementDataset<IdentifyCellData>(el);

            if (el.classList.contains("locked")) {
                this.unlockItem(itemUuid);
                return;
            }

            if (!el.classList.contains("toggleable")) return;

            const direction = event.button === 0 ? +1 : -1;
            const itemUpdate = (this.#updates[itemUuid] ??= {});
            const currentUpdate = itemUpdate[actorId];
            const currentValue = currentUpdate === "success" ? 2 : currentUpdate === "fail" ? 0 : 1;
            const newValue = Math.clamp(currentValue + direction, 0, 2);
            const newUpdate = newValue === 0 ? "fail" : newValue === 2 ? "success" : undefined;

            if (newUpdate) {
                el.dataset.update = newUpdate;
                itemUpdate[actorId] = newUpdate;
            } else {
                delete el.dataset.update;
                delete this.#updates[itemUuid]?.[actorId];
            }
        });

        addListenerAll(html, "[data-action]", async (event, el) => {
            const action = el.dataset.action as IdentifyEventAction;

            const getItem = async () => {
                const itemUuid = htmlClosest(el, "[data-item-uuid]")?.dataset.itemUuid;
                return itemUuid ? await fromUuid<PhysicalItemPF2e<ActorPF2e>>(itemUuid) : null;
            };

            switch (action) {
                case "auto": {
                    this.#identifyAll();
                    break;
                }

                case "reset": {
                    this.#reset();
                    break;
                }

                case "save": {
                    this.#saveChanges();
                    break;
                }

                case "open-clock": {
                    game.pf2e.worldClock.render(true);
                    break;
                }

                case "change-time": {
                    const direction = el.dataset.direction as "+" | "-";
                    advanceTime("600", direction);
                    break;
                }

                case "open-item-sheet": {
                    const item = await getItem();
                    item?.sheet.render(true);
                    break;
                }

                case "open-actor-sheet": {
                    const item = await getItem();
                    item?.actor.sheet.render(true, { tab: "inventory" });
                    break;
                }

                case "identify-item": {
                    const item = await getItem();
                    item?.setIdentificationStatus("identified");
                    break;
                }

                case "mystify-item": {
                    const item = await getItem();
                    item?.setIdentificationStatus("unidentified");
                    break;
                }

                case "misidentify-item": {
                    break;
                }

                case "send-to-chat": {
                    const item = await getItem();
                    item?.toMessage();
                    break;
                }

                case "post-skill-checks": {
                    const item = await getItem();
                    if (!item) return;

                    const app = new IdentifyItemPopup(item);
                    app.requestChecks();

                    break;
                }
            }
        });
    }

    async #identifyAll() {
        const knownItems = settings.identifyPartials
            ? this.#knownItems
            : this.#knownItems.filter(({ partial }) => !partial);

        const knownUUIDS = knownItems.map(({ uuid }) => uuid);

        const selectedList =
            this.#unlockedUUIDs.length > 0
                ? R.intersection(knownUUIDS, this.#unlockedUUIDs)
                : knownUUIDS;

        const items = R.pipe(
            await Promise.all(
                selectedList.map((itemUuid) => fromUuid<PhysicalItemPF2e<ActorPF2e>>(itemUuid))
            ),
            R.filter((item): item is PhysicalItemPF2e<ActorPF2e> => !!item && !item.isIdentified)
        );

        if (!items.length) {
            promptDialog({
                title: localize("tracker.auto.title"),
                content: localize("tracker.auto.none"),
            });
            return;
        }

        const confirm = await confirmDialog({
            title: localize("tracker.auto.title"),
            content: localize("tracker.auto.content", {
                items: createDialogItemList(items),
            }),
        });

        if (!confirm) return;

        this.#setLoading(true);

        await this.#identifyList(items);

        this.#setLoading(false);
        this.render();
    }

    async #identifyList(items: PhysicalItemPF2e<ActorPF2e>[]) {
        const actorsUpdates: Record<
            string,
            { actor: ActorPF2e; items: PhysicalItemPF2e<ActorPF2e>[] }
        > = {};

        for (const item of items) {
            const actorUpdates = (actorsUpdates[item.actor.id] ??= {
                actor: item.actor,
                items: [],
            });
            actorUpdates.items.push(item);
        }

        return Promise.all(
            Object.values(actorsUpdates).map(({ actor, items }) => {
                const updates = items.map((item) => ({
                    _id: item.id,
                    [flagPath("-=failed")]: true,
                    ["system.identification.status"]: "identified",
                    ["system.identification.unidentified"]: item.getMystifiedData("unidentified"),
                }));
                return actor.updateEmbeddedDocuments("Item", updates);
            })
        );
    }

    async #saveChanges() {
        const actors: Record<string, ActorPF2e | undefined> = {};
        const items: Record<string, PhysicalItemPF2e<ActorPF2e> | null> = {};
        const toIdentify: PhysicalItemPF2e<ActorPF2e>[] = [];
        const identifyUpdates: Record<string, IdenfifiedFlag> = {};
        const failUpdates: Record<string, Record<string, IdentifyFailedFlag>> = {};
        const updateElements = htmlQueryAll(this.element, "[data-update]");
        const worldTime = game.pf2e.worldClock.worldTime.toString();

        const getActor = (actorId: string) => {
            return (actors[actorId] ??= game.actors.get(actorId));
        };

        const getItem = async (itemUuid: string) => {
            return (items[itemUuid] ??= await fromUuid(itemUuid));
        };

        const addFailedUpdate = (
            item: PhysicalItemPF2e<ActorPF2e>,
            actorId: string,
            remove: boolean
        ) => {
            const actorUpdates = (failUpdates[item.actor.id] ??= {});
            const itemUpdates = (actorUpdates[item.id] ??= {});
            itemUpdates[remove ? `-=${actorId}` : actorId] = worldTime;
        };

        await Promise.all(
            updateElements.map(async (updateElement) => {
                const { actorId, itemUuid, update, type, itemSlug, itemName, partialSlug } =
                    elementDataset<IdentifyCellData>(updateElement);

                const item = await getItem(itemUuid);
                const actor = getActor(actorId);
                if (!actor || !item) return;

                this.#removedFaillures[itemUuid]?.delete(actorId);

                if (update === "success") {
                    const updates = (identifyUpdates[actorId] ??= foundry.utils.deepClone(
                        getFlag<IdenfifiedFlag>(actor, "identified") ?? {}
                    ));

                    if (!item.isIdentified) {
                        toIdentify.push(item);
                    }

                    (updates[type] ??= []).push({
                        itemSlug,
                        itemName,
                        partialSlug,
                    });
                } else {
                    addFailedUpdate(item, actorId, false);
                }
            })
        );

        if (toIdentify.length) {
            const confirm = await confirmDialog({
                title: localize("tracker.save.title"),
                content: localize("tracker.save.content", {
                    items: createDialogItemList(toIdentify),
                }),
            });
            if (!confirm) return;
        }

        this.#setLoading(true);

        if (!R.isEmpty(identifyUpdates)) {
            const updates = R.pipe(
                R.entries(identifyUpdates),
                R.map(([actorId, update]) => {
                    return {
                        _id: actorId,
                        [flagPath("identified")]: update,
                    };
                })
            );

            await Actor.updateDocuments(updates);
        }

        for (const [itemUuid, actors] of Object.entries(this.#removedFaillures)) {
            const item = await getItem(itemUuid);
            if (!item) continue;

            for (const actorId of actors) {
                addFailedUpdate(item, actorId, true);
            }
        }

        await Promise.all(
            Object.entries(failUpdates).map(([actorId, actorUpdates]) => {
                const actor = getActor(actorId);
                if (!actor) return;

                const updates: EmbeddedDocumentUpdateData[] = [];

                for (const [itemId, failUpdate] of R.entries(actorUpdates)) {
                    const update: EmbeddedDocumentUpdateData = {
                        _id: itemId,
                    };

                    const toId = toIdentify.findSplice(
                        (item) => item.actor === actor && item.id === itemId
                    );

                    if (toId) {
                        update[flagPath("-=failed")] = true;
                        update["system.identification.status"] = "identified";
                        update["system.identification.unidentified"] =
                            toId.getMystifiedData("unidentified");
                    } else {
                        update[flagPath("failed")] = failUpdate;
                    }

                    updates.push(update);
                }

                return actor.updateEmbeddedDocuments("Item", updates);
            })
        );

        if (toIdentify.length) {
            await this.#identifyList(toIdentify);
        }

        this.#setLoading(false);
        this.#reset();
    }
}

function createDialogItemList(items: PhysicalItemPF2e[]) {
    return R.pipe(
        items,
        R.sortBy((item) => item.system.identification.identified.name),
        R.map((item) => `<li>${item.system.identification.identified.name}</li>`),
        R.join("")
    );
}

function refreshTracker(fullReset?: boolean) {
    PF2eToolbeltIdentify.instance?.render({ fullReset });
}

function closeTracker() {
    PF2eToolbeltIdentify.instance?.close();
}

function openTracker(item?: ItemPF2e) {
    if (!game.user.isGM) return;

    if (PF2eToolbeltIdentify.instance) {
        PF2eToolbeltIdentify.instance.bringToFront();
        if (item) PF2eToolbeltIdentify.instance.unlockItem(item);
    } else {
        PF2eToolbeltIdentify.instance = new PF2eToolbeltIdentify(item);
        PF2eToolbeltIdentify.instance.render(true);
    }
}

function getSpellList(actor: CharacterPF2e): IdentifySpellList {
    const traditions: Set<MagicTradition> = new Set();
    const known: Set<string> = new Set();

    for (const entry of actor.spellcasting.spellcastingFeatures) {
        const tradition = entry.tradition;

        if (tradition) {
            traditions.add(tradition);
        }

        for (const spell of entry.spells ?? []) {
            if (spell.rarity !== "common" || !tradition) {
                known.add(spell.slug ?? game.pf2e.system.sluggify(spell.name));
            }
        }
    }

    return {
        traditions: [...traditions],
        known: [...known],
    };
}

type IdentifyEventAction =
    | "auto"
    | "save"
    | "reset"
    | "open-clock"
    | "change-time"
    | "open-actor-sheet"
    | "open-item-sheet"
    | "mystify-item"
    | "identify-item"
    | "send-to-chat"
    | "post-skill-checks"
    | "misidentify-item";

type SocketPacket = {
    itemUUID: ItemUUID;
};

type IdentifyRenderOptions = ApplicationRenderOptions & {
    fullReset?: boolean;
};

type IdentifyCellData = {
    update: "fail" | "success";
    actorId: string;
    itemUuid: ItemUUID;
    type: PhysicalItemType;
    itemSlug: string;
    itemName?: string;
    partialSlug?: string;
};

type IdentifySpellList = {
    traditions: MagicTradition[];
    known: string[];
};

type IdentifyFailedFlag = Record<string, string>;

type IdenfifiedFlag = Partial<
    Record<
        PhysicalItemType,
        {
            itemSlug: string;
            itemName?: string;
            partialSlug?: string;
        }[]
    >
>;

type ItemActor = {
    id: string;
    css: string;
    failed: boolean;
    tooltip: string;
    canToggle: boolean;
    canRecallKnowledge: boolean;
    known: boolean | string;
    update: "success" | "fail" | undefined;
};

type IdentifyGroupItem = {
    img: string;
    css: string;
    uuid: string;
    name: string;
    itemSlug: string;
    isLocked: boolean;
    actors: (ItemActor | { id: string })[];
    isIdentified: boolean;
    partialSlug: string | undefined;
    owner: { name: string; id: string; icon: string };
    identifyTooltip: string | undefined;
};

type IdentifyContext = {
    time: string;
    date: string;
    actors: CharacterPF2e[];
    itemGroups: {
        type: PhysicalItemType;
        label: string;
        items: IdentifyGroupItem[];
    }[];
};

export { config as identifyTool };
