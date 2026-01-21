import {
    ActorPF2e,
    ActorType,
    advanceTime,
    ApplicationClosingOptions,
    ApplicationConfiguration,
    ApplicationRenderOptions,
    CharacterPF2e,
    confirmDialog,
    DateTime,
    getItemIdentificationDCs,
    getShortDateTime,
    htmlClosest,
    htmlQueryAll,
    IdentifyItemPopup,
    isCastConsumable,
    ItemPF2e,
    MagicTradition,
    MapOfArrays,
    PhysicalItemPF2e,
    PhysicalItemType,
    R,
    SkillSlug,
    sluggify,
} from "module-helpers";
import { ModuleToolApplication } from "module-tool";
import { IdentifiedItemModel, IdentifiedItemSource, IdentifyTool } from ".";

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

class IdentifyTracker extends ModuleToolApplication<IdentifyTool> {
    #hooks: [event: string, id: number][] = [];
    #itemsUUIDs: ItemUUID[] = [];
    #knownItems: { uuid: ItemUUID; partial: boolean }[] = [];
    #loading = false;
    #removedFaillures: Record<string, Set<string>> = {};
    #unlockedUUIDs: ItemUUID[] = [];
    #updates: Record<string, Record<string, "success" | "fail">> = {};

    static ID = "pf2e-toolbelt-identify-tracker";

    static DEFAULT_OPTIONS: DeepPartial<ApplicationConfiguration> = {
        id: IdentifyTracker.ID,
    };

    constructor(item: Maybe<ItemPF2e>, tool: IdentifyTool, options?: DeepPartial<ApplicationConfiguration>) {
        super(tool, options);

        if (this.isValidItem(item)) {
            this.#unlockedUUIDs.push(item.uuid);
        }
    }

    get key(): string {
        return "tracker";
    }

    get title(): string {
        return this.localize("title");
    }

    async render(options?: boolean | IdentifyRenderOptions, _options?: IdentifyRenderOptions) {
        if (this.#loading) return this;

        const useOptions = R.isPlainObject(options) ? (options as IdentifyRenderOptions) : _options;

        if (useOptions && useOptions.reset) {
            this.#itemsUUIDs = [];
            this.#reset();
        }

        return super.render(options, _options);
    }

    isValidItem(item: Maybe<ItemPF2e>): item is PhysicalItemPF2e<ActorPF2e> {
        return this.tool.isValidItem(item);
    }

    unlockItem(itemOrUUID: Maybe<ItemPF2e | ItemUUID>) {
        const itemUUID = R.isString(itemOrUUID)
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

        const elements = this.element.querySelectorAll<HTMLElement>(`[data-item-uuid="${itemUUID}"]`);
        for (const element of elements) {
            element.classList.remove("locked");
            element.removeEventListener("click", this.#onClickLocked);
        }
    }

    protected _onClose(_options: ApplicationClosingOptions): void {
        this.#reset();
        this.#itemsUUIDs = [];
        this.#unlockedUUIDs = [];

        for (const [event, id] of this.#hooks) {
            Hooks.off(event, id);
        }
    }

    async _prepareContext(_options: IdentifyRenderOptions): Promise<IdentifyContext> {
        const party = game.actors.party;
        const members = party?.members ?? [];
        const characters = members.filter((actor): actor is CharacterPF2e => actor.isOfType("character"));

        const spellLists: Record<string, IdentifySpellList> = {};
        const itemGroups = new MapOfArrays<IdentifyGroupItem, PhysicalItemType>();

        const useDelay = this.settings.delay;
        const { worldTime, date, time } = getShortDateTime();

        const items: PhysicalItemPF2e<ActorPF2e>[] = R.pipe(
            members,
            R.flatMap((actor) => actor.inventory.contents),
            R.filter((item) => !item.isIdentified),
        );

        if (party) {
            items.push(...party.inventory.contents.filter((item) => !item.isIdentified));
        }

        const ghostItems = R.pipe(
            await Promise.all(
                R.pipe(
                    [...this.#itemsUUIDs, ...this.#unlockedUUIDs],
                    R.unique(),
                    R.difference(items.map((item) => item.uuid)),
                    R.map((uuid) => fromUuid<PhysicalItemPF2e<ActorPF2e>>(uuid)),
                ),
            ),
            R.filter(R.isTruthy),
            R.filter((item) => this.isValidItem(item)),
        );

        const allItems = [...items, ...ghostItems];
        const hasLockedItems = this.#unlockedUUIDs.length > 0;

        this.#knownItems = [];
        this.#removedFaillures = {};
        this.#itemsUUIDs = allItems.map((item) => item.uuid);

        await Promise.all(
            allItems.map(async (item) => {
                const itemUUID = item.uuid;
                const actor = item.actor;
                const isIdentified = item.isIdentified;
                const itemType = item.type as PhysicalItemType;
                const data = item.system.identification.identified;
                const isConsumable = item.isOfType("consumable");
                const scrollWandSpell = isConsumable && isCastConsumable(item) && item.embeddedSpell;
                const tradition =
                    scrollWandSpell && scrollWandSpell.rarity === "common" ? scrollWandSpell.traditions : undefined;
                const itemSlug = scrollWandSpell
                    ? (scrollWandSpell.slug ?? sluggify(scrollWandSpell.name))
                    : (item.slug ?? sluggify(data.name));
                const partialSlug =
                    isConsumable && !scrollWandSpell ? sluggify(data.name.replace(PARTIAL_SLUGH_REGEX, "")) : undefined;
                const locked = !isIdentified && hasLockedItems && !this.#unlockedUUIDs.includes(itemUUID);

                const itemClasses: (string | boolean)[] = [isIdentified && "identified", locked && "locked"];

                const owner = {
                    name: actor.name,
                    id: actor.id,
                    icon: getOwnerIcon(actor),
                };

                const actors: IdentifyGroupItem["actors"] = characters.map((actor): ItemActor | { id: string } => {
                    const actorId = actor.id;

                    if (isIdentified) {
                        return { id: actorId };
                    }

                    const failed = ((): number => {
                        const fail = this.tool.getFlag(item, "failed", actorId);
                        if (!R.isString(fail)) return 0;

                        const failTime = DateTime.fromISO(fail);
                        const diffTime = worldTime.diff(failTime, useDelay ? "hours" : "days");
                        const removeFail = useDelay ? diffTime.hours >= 24 : diffTime.days >= 1;

                        if (removeFail) {
                            const toRemove = (this.#removedFaillures[itemUUID] ??= new Set());
                            toRemove.add(actorId);
                        }

                        return removeFail ? 0 : useDelay ? 24 - diffTime.hours : 1;
                    })();

                    const known = (() => {
                        if (failed) {
                            return false;
                        }

                        const identification = this.tool.getDataFlagArray(
                            actor,
                            IdentifiedItemModel,
                            "identified",
                            itemType,
                        );

                        const full = identification.find((x) => x.itemSlug === itemSlug);

                        if (full) {
                            return true;
                        }

                        if (partialSlug) {
                            const partial = identification.find((x) => x.partialSlug === partialSlug);

                            if (partial?.itemName) {
                                return partial.itemName;
                            }
                        }

                        return false;
                    })();

                    if (known !== false) {
                        this.#knownItems.push({
                            uuid: itemUUID,
                            partial: R.isString(known),
                        });
                    }

                    const canRecallKnowledge = (() => {
                        if (failed || known !== false || !scrollWandSpell) {
                            return false;
                        }

                        const list = (spellLists[actorId] ??= getSpellList(actor));
                        const isTradition = !!tradition && list.traditions.some((x) => tradition.has(x));

                        return isTradition || list.known.includes(itemSlug);
                    })();

                    const tooltip = failed
                        ? useDelay
                            ? this.localize("failed.delay", { hours: failed })
                            : this.localize("failed.daily")
                        : typeof known === "string"
                          ? this.localize("known.partial", { item: known })
                          : known === true
                            ? this.localize("known.full")
                            : canRecallKnowledge
                              ? this.localize("known.recall")
                              : "";

                    const update = !failed && known !== true ? this.#updates[itemUUID]?.[actorId] : undefined;

                    const canToggle = !isIdentified && !failed && known !== true;

                    const actorClasses: (string | false)[] = [failed !== 0 && "failed", canToggle && "toggleable"];

                    return {
                        id: actorId,
                        known,
                        update,
                        tooltip,
                        canToggle,
                        canRecallKnowledge,
                        failed: failed !== 0,
                        css: actorClasses.filter(R.isString).join(" "),
                    };
                });

                const groupItem: IdentifyGroupItem = {
                    actors,
                    css: itemClasses.filter(R.isString).join(" "),
                    identifyTooltip: isIdentified ? undefined : await createIdenticationTooltip(item),
                    img: data.img,
                    isIdentified,
                    isLocked: locked,
                    itemSlug: itemSlug,
                    name: data.name,
                    owner,
                    partialSlug,
                    uuid: itemUUID,
                };

                itemGroups.add(itemType, groupItem);
            }),
        );

        return {
            time,
            date,
            actors: characters,
            itemGroups: R.sortBy(
                itemGroups.map((items, type): IdentifyContextItemGroup => {
                    return {
                        type,
                        label: game.i18n.localize(`TYPES.Item.${type}`),
                        items: R.sortBy(items, R.prop("name")),
                    };
                }),
                R.prop("label"),
            ),
        };
    }

    protected _onFirstRender(_context: object, _options: ApplicationRenderOptions): void {
        this.#hooks = (
            [
                ["updateWorldTime", () => (this.render(), undefined)],
                ["updateActor", this.#onUpdateActor.bind(this)],
                ["updateItem", this.#onUpdateItem.bind(this)],
                ["deleteItem", this.#onUpdateItem.bind(this)],
                ["createItem", this.#onUpdateItem.bind(this)],
            ] as const
        ).map(([event, listener]) => {
            return [event, Hooks.on(event, listener)];
        });
    }

    async _onClickAction(event: PointerEvent, target: HTMLElement) {
        const action = target.dataset.action as EventAction;

        const getItem = async () => {
            const itemUuid = htmlClosest(target, "[data-item-uuid]")?.dataset.itemUuid;
            return itemUuid ? await fromUuid<PhysicalItemPF2e<ActorPF2e>>(itemUuid) : null;
        };

        switch (action) {
            case "auto": {
                return this.#identifyAll();
            }

            case "change-time": {
                const direction = target.dataset.direction as "+" | "-";
                return advanceTime("600", direction);
            }

            case "identify-item": {
                const item = await getItem();
                return item?.setIdentificationStatus("identified");
            }

            case "mystify-item": {
                const item = await getItem();
                return item?.setIdentificationStatus("unidentified");
            }

            case "open-actor-sheet": {
                const item = await getItem();
                return item?.actor.sheet.render(true, { tab: "inventory" });
            }

            case "open-clock": {
                return game.pf2e.worldClock.render(true);
            }

            case "open-item-sheet": {
                const item = await getItem();
                return item?.sheet.render(true);
            }

            case "post-skill-checks": {
                const item = await getItem();
                if (!item) return;

                const app = new IdentifyItemPopup(item);
                return app.postSkillChecks();
            }

            case "reset": {
                return this.#reset();
            }

            case "save": {
                return this.#saveUpdates();
            }

            case "select-update": {
                return this.#selectUpdate(event, target);
            }

            case "send-to-chat": {
                const item = await getItem();
                return item?.toMessage();
            }
        }
    }

    #onClickLocked = ((event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();

        const target = event.currentTarget as HTMLElement;
        this.unlockItem(target.dataset.itemUuid as ItemUUID);
    }).bind(this);

    protected _activateListeners(html: HTMLElement): void {
        const highlightElements = html.querySelectorAll<HTMLElement>(".highlight");

        for (const el of highlightElements) {
            if (el.classList.contains("locked")) {
                el.addEventListener("click", this.#onClickLocked);
            }

            el.addEventListener("mouseenter", () => {
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

            el.addEventListener("mouseleave", () => {
                const cells = html.querySelectorAll(".highlighted");

                for (const cell of cells) {
                    cell.classList.remove("highlighted");
                }
            });
        }
    }

    #selectUpdate(event: PointerEvent, el: HTMLElement) {
        if (![0, 2].includes(event.button)) return;

        const { itemUuid, actorId } = el.dataset;
        if (!itemUuid || !actorId) return;

        if (el.classList.contains("locked")) {
            this.unlockItem(itemUuid as ItemUUID);
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
    }

    async #identifyAll() {
        const knownItems = this.settings.identifyPartials
            ? this.#knownItems
            : this.#knownItems.filter(({ partial }) => !partial);

        const knownUUIDS = knownItems.map(({ uuid }) => uuid);

        const selectedList =
            this.#unlockedUUIDs.length > 0 ? R.intersection(knownUUIDS, this.#unlockedUUIDs) : knownUUIDS;

        const items = R.pipe(
            await Promise.all(selectedList.map((itemUuid) => fromUuid<PhysicalItemPF2e<ActorPF2e>>(itemUuid))),
            R.filter((item): item is PhysicalItemPF2e<ActorPF2e> => !!item && !item.isIdentified),
        );

        if (!items.length) {
            return foundry.applications.api.DialogV2.prompt({
                content: this.localize("auto.none"),
                window: {
                    title: this.localize("auto.title"),
                },
            });
        }

        const confirm = await confirmDialog(this.localizeKey("auto"), {
            data: { items: createDialogItemList(items) },
        });

        if (!confirm) return;

        this.#setLoading(true);

        await this.#identifyList(items);

        this.#setLoading(false);
        this.render();
    }

    async #saveUpdates() {
        const items: Record<string, PhysicalItemPF2e<ActorPF2e> | null> = {};
        const toIdentify: PhysicalItemPF2e<ActorPF2e>[] = [];
        const updateElements = htmlQueryAll(this.element, "[data-update]");
        const worldTime = game.pf2e.worldClock.worldTime.toString();

        const identifyUpdates: Record<string, PartialRecord<PhysicalItemType, IdentifiedItemSource[]>> = {};

        const failUpdates: Record<string, Record<string, Record<string, string | null>>> = {};

        const getItem = async (itemUuid: string) => {
            return (items[itemUuid] ??= await fromUuid(itemUuid));
        };

        const addFailedUpdate = (item: PhysicalItemPF2e<ActorPF2e>, actorId: string, remove: boolean) => {
            const itemActorUpdates = (failUpdates[item.actor.id] ??= {});
            const itemUpdates = (itemActorUpdates[item.id] ??= {});

            if (remove) {
                itemUpdates[`-=${actorId}`] = null;
            } else {
                itemUpdates[actorId] = worldTime;
            }
        };

        const elementsUpdatesPromises = updateElements.map(async (updateElement) => {
            const { actorId, itemUuid, update, type, itemSlug, itemName, partialSlug } = updateElement.dataset;

            if (!itemUuid || !actorId || !type || !itemSlug) return;

            const item = await getItem(itemUuid);
            const actor = game.actors.get(actorId);
            if (!actor || !item) return;

            this.#removedFaillures[itemUuid]?.delete(actorId);

            if (update === "success") {
                const actorUpdates = (identifyUpdates[actor.id] ??= {});
                const updates = (actorUpdates[type as PhysicalItemType] ??=
                    this.tool.getFlag<IdentifiedItems>(actor, "identified", type)?.slice() ?? []);

                if (!item.isIdentified) {
                    toIdentify.push(item);
                }

                updates.push({ itemSlug, itemName, partialSlug });
            } else {
                addFailedUpdate(item, actorId, false);
            }
        });

        await Promise.all(elementsUpdatesPromises);

        if (toIdentify.length) {
            const confirm = await confirmDialog(this.localizeKey("save"), {
                data: { items: createDialogItemList(toIdentify) },
            });
            if (!confirm) return;
        }

        this.#setLoading(true);

        if (!R.isEmpty(identifyUpdates)) {
            const updates = R.pipe(
                R.entries(identifyUpdates),
                R.map(([actorId, update]) => {
                    return this.tool.setFlagProperty({ _id: actorId }, "identified", update);
                }),
            );

            await Actor.updateDocuments(updates);
        }

        for (const [itemUuid, actors] of R.entries(this.#removedFaillures)) {
            const item = await getItem(itemUuid);
            if (!item) continue;

            for (const actorId of actors) {
                addFailedUpdate(item, actorId, true);
            }
        }

        await Promise.all(
            Object.entries(failUpdates).map(([actorId, actorUpdates]) => {
                const actor = game.actors.get(actorId);
                if (!actor) return;

                const updates: EmbeddedDocumentUpdateData[] = [];

                for (const [itemId, failUpdate] of R.entries(actorUpdates)) {
                    const update: EmbeddedDocumentUpdateData = {
                        _id: itemId,
                    };

                    const toId = toIdentify.findSplice((item) => item.actor === actor && item.id === itemId);

                    if (toId) {
                        foundry.utils.setProperty(update, "system.identification", {
                            status: "identified",
                            unidentified: toId.getMystifiedData("unidentified"),
                        });
                        this.tool.unsetFlagProperty(update, "failed");
                    } else {
                        this.tool.setFlagProperty(update, "failed", failUpdate);
                    }

                    updates.push(update);
                }

                return actor.updateEmbeddedDocuments("Item", updates);
            }),
        );

        if (toIdentify.length) {
            await this.#identifyList(toIdentify);
        }

        this.#setLoading(false);
        this.#reset();
    }

    async #identifyList(items: PhysicalItemPF2e<ActorPF2e>[]) {
        type ActorsUpdate = { actor: ActorPF2e; items: PhysicalItemPF2e<ActorPF2e>[] };

        const actorsUpdates: Record<string, ActorsUpdate> = {};

        for (const item of items) {
            const actorUpdates = (actorsUpdates[item.actor.id] ??= {
                actor: item.actor,
                items: [],
            });

            actorUpdates.items.push(item);
        }

        return Promise.all(
            Object.values(actorsUpdates).map(({ actor, items }) => {
                const updates = items.map((item) => {
                    const data = item.getMystifiedData("unidentified");

                    return this.tool.unsetFlagProperty(
                        {
                            _id: item.id,
                            ["system.identification.status"]: "identified",
                            ["system.identification.unidentified"]: data,
                        },
                        "failed",
                    );
                });

                return actor.updateEmbeddedDocuments("Item", updates);
            }),
        );
    }

    #setLoading(enabled: boolean) {
        this.#loading = enabled;
        this.element.classList.toggle("loading", enabled);
    }

    #reset() {
        this.#updates = {};
        this.render();
    }

    #onUpdateActor(actor: ActorPF2e) {
        if (actor === game.actors.party) {
            this.render();
        }
    }

    #onUpdateItem(item: ItemPF2e) {
        if (this.isValidItem(item)) {
            this.render();
        }
    }
}

function createDialogItemList(items: PhysicalItemPF2e[]) {
    return R.pipe(
        items,
        R.sortBy((item) => item.system.identification.identified.name),
        R.map((item) => `<li>${item.system.identification.identified.name}</li>`),
        R.join(""),
    );
}

async function createIdenticationTooltip(item: PhysicalItemPF2e<ActorPF2e>) {
    const dcs = getItemIdentificationDCs(item) as Record<SkillSlug, number>;

    let tooltip = `<h3>${game.i18n.localize("PF2E.identification.Identify")}</h3>`;
    tooltip += `<div class="grid">`;

    for (const [skill, dc] of R.entries(dcs)) {
        const name = game.i18n.localize(CONFIG.PF2E.skills[skill].label);
        tooltip += `<div>${name}</div><div>${dc}</div>`;
    }

    tooltip += "</div>";

    return tooltip;
}

function getOwnerIcon(actor: ActorPF2e) {
    const actorType = actor.type as ActorType;

    if (actorType !== "character") {
        return ACTOR_TYPE_ICONS[actorType];
    }

    const traits = actor.traits;

    return traits.has("eidolon") ? EIDOLON_ICON : traits.has("minion") ? COMPANION_ICON : ACTOR_TYPE_ICONS.character;
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
                known.add(spell.slug ?? sluggify(spell.name));
            }
        }
    }

    return {
        traditions: [...traditions],
        known: [...known],
    };
}

type EventAction =
    | "auto"
    | "change-time"
    | "identify-item"
    | "mystify-item"
    | "open-actor-sheet"
    | "open-clock"
    | "open-item-sheet"
    | "post-skill-checks"
    | "reset"
    | "save"
    | "select-update"
    | "send-to-chat";

type IdentifiedItems = IdentifiedItemSource[];

type IdentifySpellList = {
    traditions: MagicTradition[];
    known: string[];
};

type IdentifyContext = {
    actors: CharacterPF2e[];
    date: string;
    time: string;
    itemGroups: IdentifyContextItemGroup[];
};

type IdentifyContextItemGroup = {
    type: PhysicalItemType;
    label: string;
    items: IdentifyGroupItem[];
};

type IdentifyRenderOptions = ApplicationRenderOptions & {
    reset?: boolean;
};

type ItemActor = {
    canRecallKnowledge: boolean;
    canToggle: boolean;
    css: string;
    failed: boolean;
    id: string;
    known: boolean | string;
    tooltip: string;
    update: "success" | "fail" | undefined;
};

type IdentifyGroupItem = {
    actors: (ItemActor | { id: string })[];
    css: string;
    identifyTooltip: string | undefined;
    img: string;
    isIdentified: boolean;
    isLocked: boolean;
    itemSlug: string;
    name: string;
    owner: { name: string; id: string; icon: string };
    partialSlug: string | undefined;
    uuid: string;
};

export { IdentifyTracker };
