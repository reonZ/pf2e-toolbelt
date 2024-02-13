import {
	canBeInvested,
	error,
	getElementIndex,
	getFlag,
	getInMemory,
	getSetting,
	hasWornSlot,
	indexIsValid,
	isHandwrapsOfMightyBlows,
	isHeld,
	isInvestedOrWornAs,
	isOneHanded,
	isTwoHanded,
	itemCarryUpdate,
	render,
	setFlag,
	setInMemory,
} from "module-api";
import {
	getCharacterSheetTab,
	isPlayedActor,
	registerCharacterSheetExtraTab,
	unregisterCharacterSheetExtraTab,
} from "../actor";
import { closestInside, makeDraggable } from "../draggable";
import { createHook } from "../hooks";

const closeHook = createHook(
	"closeCharacterSheetPF2e",
	closeCharacterSheetPF2e,
);

let dragging = false;

export function registerInventory() {
	return {
		settings: [
			{
				key: "inventory",
				type: Boolean,
				default: false,
				scope: "client",
				onChange: (value) => setup(value),
			},
		],
		ready: (isGm) => {
			setup();
		},
	};
}

let dragIdentifier;

const COINS = [
	"platinum-pieces",
	"gold-pieces",
	"silver-pieces",
	"copper-pieces",
];

function setup(value) {
	const enabled = value ?? getSetting("inventory");
	if (enabled) {
		registerCharacterSheetExtraTab({
			tabName: "inventory",
			templateFolder: "inventory/sheet",
			getData,
			addEvents,
			onRender,
		});
	} else {
		unregisterCharacterSheetExtraTab("inventory");
	}
	closeHook(enabled);
}

function closeCharacterSheetPF2e(sheet, html) {
	const actor = sheet.actor;
	if (!isPlayedActor(actor)) return;
	if (!getInMemory(sheet, "inventory.requireSave")) return;

	const tab = getCharacterSheetTab(html, "inventory")[0];
	const data = getCurrentData(tab);
	if (!data) return;

	setFlag(actor, "inventory", data);
}

function onRender(actor, sheet, inner) {
	const sidebar = inner.find("> aside");
	sidebar.css("position", "relative");
	sidebar.append(
		"<div id='pf2e-toobelt-inventory-item-details' class='hidden'></div>",
	);
}

function getCurrentData(tabElement) {
	if (!tabElement) return;

	const alternate = tabElement.querySelector(":scope > .alternate");
	const equipped = alternate.querySelector("[data-area='equipped']");

	const equippedItemId = (slot) => {
		const el = equipped.querySelector(`[data-equipped-slot='${slot}']`);
		const item = el.querySelector("[data-item-id]");
		return item?.dataset.itemId ?? null;
	};

	const itemIds = (parent) => {
		const ids = {};
		const items = parent.querySelectorAll(":scope > [data-item-id]");
		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			ids[item.dataset.itemId] = i;
		}
		return ids;
	};

	const tabs = {};
	for (const tab of alternate.querySelectorAll("[data-area='items-grid']")) {
		const tabId = tab.dataset.tabId;
		tabs[tabId] = itemIds(tab);
	}

	return {
		equipped: {
			hands: [equippedItemId("left-hand"), equippedItemId("right-hand")],
			armor: [equippedItemId("armor")],
			others: itemIds(equipped),
		},
		tabs,
	};
}

async function getData(actor, sheet, tabElement) {
	const flags = getFlag(actor, "inventory");
	const data = getCurrentData(tabElement[0]) ??
		flags ?? {
			equipped: {
				hands: [null, null],
				armor: [null],
				others: {},
			},
			tabs: {},
		};

	if (!flags) {
		setInMemory(sheet, "inventory.requireSave", true);
	}

	const tabs = new Collection();
	const orphans = {};
	const containers = new Set();
	const equipped = {
		hands: [null, null],
		armor: [null],
		others: [],
	};

	function getTab(item) {
		const tabId = item?.id;

		let tab = tabs.get(tabId);
		if (tab) return tab;

		tab = {
			id: tabId,
			item: item,
			parent: item?.container,
			containers: [],
			matrix: [],
			parents: [],
		};

		tabs.set(tabId, tab);
		return tab;
	}

	for (const item of actor.inventory) {
		if (
			item.isOfType("treasure") &&
			item.system.stackGroup === "coins" &&
			COINS.includes(item.slug)
		) {
			continue;
		}

		const itemId = item.id;
		const parent = item.container;

		// we retrieve the parent tab, undefined === root inventory
		const tab = getTab(parent);

		const addOrphan = (item) => {
			orphans[tab.id] ??= [];
			orphans[tab.id].push(item);
		};

		if (item.isOfType("backpack")) {
			tab.containers.push(item);
			containers.add(item);

			// we create the tab for this container, in case it is empty
			getTab(item);
			continue;
		}

		const handsHeld = item.handsHeld;
		const equippedHands = equipped.hands.filter(Boolean).length;

		if (handsHeld === 2 && equippedHands === 0) {
			if (data.equipped.hands[0] === itemId) {
				equipped.hands = [item, item];
			} else {
				addOrphan(item);
			}
			continue;
		}

		if (handsHeld === 1 && equippedHands <= 1) {
			const handIndex = data.equipped.hands.indexOf(itemId);
			if (indexIsValid(handIndex)) {
				equipped.hands[handIndex] = item;
			} else {
				addOrphan(item);
			}
			continue;
		}

		if (!equipped.armor[0] && item.isOfType("armor") && item.isEquipped) {
			if (data.equipped.armor[0] === itemId) {
				equipped.armor[0] = item;
			} else {
				addOrphan(item);
			}
			continue;
		}

		if (
			(item.isOfType("equipment") || isHandwrapsOfMightyBlows(item)) &&
			isInvestedOrWornAs(item)
		) {
			const equippedIndex = data.equipped.others[itemId];
			if (indexIsValid(equippedIndex)) {
				equipped.others[equippedIndex] = item;
			} else {
				addOrphan(item);
			}
			continue;
		}

		const index = data.tabs[tab.id]?.[itemId];
		if (indexIsValid(index)) {
			tab.matrix[index] = item;
			continue;
		}

		addOrphan(item);
	}

	for (const tab of tabs) {
		const tabOrphans = orphans[tab.id];
		if (!tabOrphans) continue;

		for (const item of tabOrphans) {
			const handsHeld = item.handsHeld;
			const equippedHands = equipped.hands.filter(Boolean).length;

			if (equippedHands === 0 && handsHeld === 2) {
				equipped.hands = [item, item];
				continue;
			}

			if (equippedHands <= 1 && handsHeld === 1) {
				const otherIndex = equipped.hands[0] ? 1 : 0;
				equipped.hands[otherIndex] = item;
				continue;
			}

			if (!equipped.armor[0] && item.isOfType("armor") && item.isEquipped) {
				equipped.armor[0] = item;
				continue;
			}

			if (
				(item.isOfType("equipment") || isHandwrapsOfMightyBlows(item)) &&
				isInvestedOrWornAs(item)
			) {
				equipped.others.push(item);
				continue;
			}

			tab.matrix.push(item);
		}

		tab.matrix = tab.matrix.filter(Boolean);
	}

	for (const tab of tabs) {
		let parent = tab.parent;

		while (parent) {
			tab.parents.push(parent);
			parent = parent.container;
		}

		tab.parents.reverse();

		const grouped = [tab.containers, tab.parents, tab.item].flat();
		tab.trailings = containers.filter((item) => !grouped.includes(item));
	}

	// if no item exist on the character, we still want one tab
	if (!tabs.size) getTab(undefined);

	equipped.others = equipped.others.filter(Boolean);

	const activeTabId = getInMemory(sheet, "inventory.activeTab");

	return {
		tabs: Array.from(tabs.values()),
		equipped,
		actor,
		selectedTab: tabs.get(activeTabId)?.id,
		containerBulk: (container) => {
			const capacity = container.capacity;
			return `${capacity.value.toString()} / ${capacity.max.toString()}`;
		},
	};
}

function addEvents(tab, sheet, actor, inner) {
	const containerTabs = tab.find("[data-tab-id]");
	for (const container of tab.find("[data-container-id]")) {
		container.addEventListener("click", (event) => {
			const tabId = container.dataset.containerId;

			containerTabs.removeClass("active");
			containerTabs.filter(`[data-tab-id=${tabId}]`).addClass("active");

			setInMemory(sheet, "inventory.activeTab", tabId);
		});
	}

	const sidebar = inner.find("#pf2e-toobelt-inventory-item-details")[0];
	const itemElements = tab.find("[data-item-id], [data-container-id]");
	for (const itemElement of itemElements) {
		itemElement.addEventListener("mouseenter", (event) =>
			onItemDetails(event, actor, itemElement, sidebar),
		);
		itemElement.addEventListener("mouseleave", (event) => {
			sidebar.classList.add("hidden");
		});
	}

	if (!actor.isOwner) return;

	dragIdentifier = randomID();

	makeDraggable({
		element: tab[0],
		selector: "[data-item-id]",
		filter: "input",
		draggedClass: "dragged",
		ghostClass: "ghost",
		identifier: dragIdentifier,
		cursorImage: {
			id: "pf2e-toolbelt-inventory-cursor-image",
			img: (target) => target.dataset.itemImg,
		},
		createGhost: createGhost,
		onDragStart: () => onDragStart(sidebar),
		onDragEnd: (event, draggable, options) => onDragEnd(sheet, options),
		droppables: [
			containersDroppable(tab, sheet),
			otherEquipmentDroppable(tab, sheet),
			largeEquipmentDroppable(tab, sheet),
			itemsListDroppable(tab, sheet),
			itemsGridDroppable(tab, sheet),
		],
	});
}

async function onItemDetails(event, actor, itemElement, sidebar) {
	if (dragging) return;

	let details = itemElement.dataset.details;

	if (!details) {
		const item = getItemFromElement(actor, itemElement);
		if (!item) return;

		details = await render("inventory/details", { item });
		itemElement.dataset.details = details;
	}

	sidebar.innerHTML = details;
	sidebar.classList.remove("hidden");
}

function onDragStart(sidebar) {
	dragging = true;
	sidebar.classList.add("hidden");
}

/**
 * @param {*} sheet
 * @param {Parameters<DraggableDragEndFunction>[2]} options
 */
function onDragEnd(sheet, { dropped, canceled }) {
	dragging = false;
	if (canceled || !dropped) return;
	setInMemory(sheet, "inventory.requireSave", true);
}

/** @type {DraggableGhostFunction} */
function createGhost(dragged, draggedIndex) {
	return dragged.parentElement.dataset.area === "items-grid"
		? { element: dragged, index: draggedIndex }
		: undefined;
}

/** @param {DraggableObj} */
function checkIdentifier(draggable) {
	if (draggable.identifier === dragIdentifier) return true;
	error("inventory.identifier.error");
	return false;
}

/** @returns {DroppableOptions} */
function itemsGridDroppable(html, sheet) {
	/** @type {DroppableFunction} */
	function onDragEnter(event, draggable, droppable) {
		if (
			droppable.element === draggable.element ||
			droppable.element === draggable.ghost
		) {
			return;
		}

		const ghost = draggable.ghost;
		const index = getElementIndex(droppable.element);
		const target =
			ghost.index >= index
				? droppable.element
				: droppable.element.nextElementSibling;

		droppable.element.parentElement.insertBefore(ghost.element, target);
		ghost.index = index;
	}

	/** @type {DroppableFunction} */
	function onDragLeave(event, draggable, droppable) {
		const parentGrid = droppable.element.parentElement;
		if (!parentGrid) return;

		const isItem = closestInside(droppable.triggeringElement, parentGrid, {
			selector: "[data-item-id]",
		});
		if (isItem) return;

		const parentList = parentGrid.parentElement;
		if (!parentList.contains(droppable.triggeringElement)) return;

		parentGrid.appendChild(draggable.ghost.element);
		draggable.ghost.index = Infinity;
	}

	return {
		element: html[0],
		selector: "[data-area='items-grid'] [data-item-id]",
		onDragEnter,
		onDragLeave,
	};
}

/** @returns {DroppableOptions} */
function itemsListDroppable(html, sheet) {
	const actor = sheet.actor;

	/** @type {DroppableFunction} */
	function onDragEnter(event, draggable, droppable) {
		const isItem = closestInside(
			droppable.triggeringElement,
			droppable.element,
			{
				selector: "[data-item-id]",
			},
		);
		if (isItem) return;

		droppable.element
			.querySelector("[data-area='items-grid']")
			.appendChild(draggable.ghost.element);
	}

	/** @type {DroppableFunction} */
	function onDragLeave(event, draggable, droppable) {
		draggable.ghost.reset();
	}

	/** @type {DroppableDropFunction} */
	async function onDrop(event, draggable, droppable) {
		if (!checkIdentifier(draggable)) return false;

		const item = getItemFromElement(actor, draggable);
		if (!item) return false;

		const updates = [];

		if (draggable.element === draggable.ghost.element) {
			draggable.ghost.classList.purge();
			cleanContainerItem(draggable.element);
		} else {
			moveItemToContainer({
				html,
				updates,
				item,
				...draggable,
				target: draggable.ghost.element,
			});
			checkForTwoHandedSlots(html, actor);
			draggable.ghost.reset();
		}

		await actor.updateEmbeddedDocuments("Item", updates);

		return true;
	}

	return {
		element: html[0],
		selector: "[data-area='items-list']",
		onDragEnter,
		onDragLeave,
		onDrop,
	};
}

/** @returns {DroppableOptions} */
function largeEquipmentDroppable(html, sheet) {
	const actor = sheet.actor;
	const rightHand = html.find("[data-equipped-slot=right-hand]")[0];

	/**
	 * @param {DraggableObj} draggable
	 * @param {DroppableObj} droppable
	 */
	function getData(draggable, droppable) {
		const slot = droppable.element.dataset.equippedSlot;

		if (
			slot === draggable.parent.dataset.equippedSlot ||
			droppable.element.querySelector("[data-two-hands]")
		) {
			return { canDrop: undefined };
		}

		const item = getItemFromElement(actor, draggable);
		if (!item) {
			return { canDrop: false };
		}

		const canDrop = slot === "armor" ? item.isOfType("armor") : true;

		return {
			item,
			slot,
			canDrop,
		};
	}

	function moveItemToSlot({
		updates,
		item,
		element,
		drop,
		noTwoHand = false,
		noUpdate = false,
	}) {
		const dropSlot = drop instanceof HTMLElement ? drop : drop.element;
		const slot = dropSlot.dataset.equippedSlot;
		const movable = element instanceof HTMLElement ? element : element.element;
		const isOneHand = isOneHanded(item);
		const isTwoHand = isTwoHanded(item);
		const canInvest = canBeInvested(item);

		dropSlot.appendChild(movable);

		const move = (carryType, handsHeld, inSlot, invested) => {
			if (!noUpdate) {
				updates.push(
					itemCarryUpdate(item, {
						carryType,
						handsHeld,
						inSlot,
						invested,
						containerId: null,
					}),
				);
			}
			movable.classList.toggle("invested", canInvest && invested);
		};

		if (slot === "armor") {
			move("worn", 0, true, true);
			return;
		}

		if (slot === "right-hand") {
			move("held", 1, false, isOneHand);
			return;
		}

		move(
			"held",
			isTwoHand && !noTwoHand ? 2 : 1,
			false,
			isHeld(item) && (!isTwoHand || !noTwoHand),
		);
	}

	/** @param {HTMLElement | {element: HTMLElement}} */
	function getSlottedItem(slot) {
		const slotElement = slot instanceof HTMLElement ? slot : slot.element;
		const element = slotElement.querySelector("[data-item-id]");
		const item = getItemFromElement(actor, element);
		return { element, item };
	}

	/** @type {DroppableFunction} */
	function onDragEnter(event, draggable, droppable) {
		const { canDrop } = getData(draggable, droppable);

		if (canDrop !== undefined) {
			droppable.classList.toggle("valid", canDrop);
			droppable.classList.toggle("invalid", !canDrop);
		}
	}

	/** @type {DroppableDropFunction} */
	async function onDrop(event, draggable, droppable) {
		if (!checkIdentifier(draggable)) return false;

		const { item, canDrop, slot } = getData(draggable, droppable);
		if (!canDrop) return false;

		const updates = [];
		const slotted = getSlottedItem(droppable);
		const dragArea = draggable.parent.dataset.area;
		const dragSlot = draggable.parent.dataset.equippedSlot;
		const isTwoHand = isTwoHanded(item);

		let noUpdate = false;

		if (dragArea === "equipped") {
			if (slotted.item) {
				moveItemToContainer({ html, updates, ...slotted });
			}
		} else if (dragArea === "items-grid") {
			if (slot === "left-hand" && isTwoHand) {
				const otherSlotted = getSlottedItem(rightHand);
				if (otherSlotted.item) {
					moveItemToContainer({ html, updates, ...otherSlotted });
				}
			}
			if (slotted.item) {
				moveItemToContainer({
					html,
					updates,
					...slotted,
					target: draggable.element,
				});
			}
		} else if (slot === "armor") {
			if (slotted.item) {
				moveItemToSlot({
					updates,
					...slotted,
					drop: draggable.parent,
				});
			}
		} else if (dragSlot === "armor") {
			if (slotted.item) {
				if (slotted.item.isOfType("armor")) {
					moveItemToSlot({
						updates,
						...slotted,
						drop: draggable.parent,
					});
				} else {
					moveItemToContainer({
						html,
						updates,
						...slotted,
					});
				}
			}
		} else if (slot === "right-hand") {
			noUpdate = true;
			if (slotted.item) {
				moveItemToSlot({
					updates,
					...slotted,
					drop: draggable.parent,
					noUpdate: true,
					noTwoHand: true,
				});
			}
		} else if (slotted.item) {
			if (isTwoHand) {
				moveItemToContainer({
					html,
					updates,
					...slotted,
				});
			} else {
				moveItemToSlot({
					updates,
					...slotted,
					drop: draggable.parent,
					noUpdate: true,
				});
				noUpdate = true;
			}
		}

		moveItemToSlot({
			updates,
			item,
			element: draggable,
			drop: droppable,
			noUpdate,
		});

		if (slot === "left-hand" || dragSlot === "left-hand") {
			checkForTwoHandedSlots(html, actor);
		}

		await actor.updateEmbeddedDocuments("Item", updates);

		return true;
	}

	return {
		element: html.find("[data-area=equipped] .main-items")[0],
		selector: "[data-equipped-slot]",
		purgeOnLeave: true,
		onDragEnter,
		onDrop,
	};
}

/** @return {DroppableObj} */
function otherEquipmentDroppable(html, sheet) {
	const actor = sheet.actor;

	/**
	 * @param {DraggableObj} draggable
	 * @param {DroppableObj} droppable
	 */
	function getData(draggable, droppable) {
		if (draggable.parent === droppable.element) {
			return { canDrop: undefined };
		}

		const item = getItemFromElement(actor, draggable);
		if (
			!item.isIdentified ||
			!(item.isOfType("equipment") || isHandwrapsOfMightyBlows(item))
		) {
			return { canDrop: false };
		}

		const canInvest = canBeInvested(item);
		const canEquip = hasWornSlot(item);
		if (!canInvest && !canEquip) {
			return { canDrop: false };
		}

		return { canDrop: true, item, canInvest };
	}

	/** @type {DroppableFunction} */
	function onDragEnter(event, draggable, droppable) {
		const { canDrop, canInvest } = getData(draggable, droppable);
		if (canDrop === undefined) return;

		droppable.classList.add("show");
		droppable.classList.toggle("add-forbidden", !canDrop);
		droppable.classList.toggle("add-invest", canDrop && canInvest);
		droppable.classList.toggle("add-equip", canDrop && !canInvest);
	}

	/** @type {DroppableDropFunction} */
	async function onDrop(event, draggable, droppable) {
		if (!checkIdentifier(draggable)) return false;

		const { canDrop, canInvest, item } = getData(draggable, droppable);
		if (!canDrop) return false;

		droppable.element.appendChild(draggable.element);
		draggable.element.classList.toggle("invested", canInvest);

		await actor.updateEmbeddedDocuments("Item", [
			itemCarryUpdate(item, {
				containerId: null,
				inSlot: true,
				invested: true,
			}),
		]);

		return true;
	}

	return {
		element: html.find("[data-area=equipped]")[0],
		filter: ".main-items",
		purgeOnLeave: true,
		onDragEnter,
		onDrop,
	};
}

/** @returns {DroppableOptions} */
function containersDroppable(html, sheet) {
	const actor = sheet.actor;

	/**
	 * @param {DraggableObj} draggable
	 * @param {DroppableObj} droppable
	 */
	function getData(draggable, droppable) {
		const item = getItemFromElement(actor, draggable);
		if (!item) return { canDrop: false };

		const containerId = droppable.element.dataset.containerId;

		if (containerId === "undefined") return { item, canDrop: true };

		const container = actor.items.get(containerId);
		if (!container) return { canDrop: false };

		const capacity = container.capacity;
		const remaining = capacity.max.minus(capacity.value);

		return {
			item,
			container,
			canDrop: remaining.value >= item.bulk.value,
		};
	}

	/** @type {DroppableFunction} */
	function onDragEnter(event, draggable, droppable) {
		const { canDrop } = getData(draggable, droppable);
		droppable.classList.toggle("valid", canDrop);
		droppable.classList.toggle("invalid", !canDrop);
	}

	/** @type {DroppableDropFunction} */
	async function onDrop(event, draggable, droppable) {
		if (!checkIdentifier(draggable)) return false;

		const { canDrop, item, container } = getData(draggable, droppable);
		if (!canDrop) return false;

		const updates = moveItemToContainer({
			html,
			updates: [],
			item,
			element: draggable,
			target: container,
		});

		if (draggable.parent.dataset.equippedSlot === "left-hand") {
			checkForTwoHandedSlots(html, actor);
		}

		await actor.updateEmbeddedDocuments("Item", updates);

		return true;
	}

	return {
		element: html[0],
		selector: "[data-container-id]",
		filter: ".back",
		purgeOnLeave: true,
		onDragEnter,
		onDrop,
	};
}

function cleanContainerItem(item) {
	item.classList.remove("invested");
	item.querySelector(".vignette.hands")?.remove();
}

function moveItemToContainer({ html, updates, item, element, target }) {
	const targetIsElement = target instanceof HTMLElement;
	const movable = element instanceof HTMLElement ? element : element.element;

	let containerId = targetIsElement
		? target.closest("[data-tab-id]").dataset.tabId
		: target instanceof Item
		  ? target.id
		  : target;

	cleanContainerItem(movable);

	if (targetIsElement) {
		target.before(movable);
	} else {
		html
			.find(`.container-tab[data-tab-id=${containerId}] [data-area=items-grid]`)
			.append(movable);
	}

	containerId = [undefined, "undefined"].includes(containerId)
		? null
		: containerId;

	updates.push(
		itemCarryUpdate(item, {
			containerId: containerId,
			inSlot: false,
			invested: false,
			carryType: containerId ? "stowed" : "worn",
			handsHeld: 0,
		}),
	);

	return updates;
}

function checkForTwoHandedSlots(html, actor) {
	/** @type {HTMLElement} */
	const equipped = html.find("[data-area='equipped'] .main-items")[0];
	const leftHand = equipped.querySelector("[data-equipped-slot='left-hand']");
	const rightHand = equipped.querySelector("[data-equipped-slot='right-hand']");
	const leftSlotted = leftHand.querySelector("[data-item-id]");
	const rightSlotted = rightHand.querySelector(".item:not(.fake)");
	const item = getItemFromElement(actor, leftSlotted);
	const isTwoHand = !!item && isTwoHanded(item);

	if (!isTwoHand && rightSlotted?.dataset.twoHands) {
		rightSlotted.remove();
	} else if (isTwoHand && !rightSlotted) {
		/** @type {HTMLElement} */
		const clone = leftSlotted.cloneNode(true);
		clone.dataset.twoHands = "true";
		rightHand.appendChild(clone);
	}
}

/** @param {HTMLElement | {element: HTMLElement}} */
function getItemFromElement(actor, element) {
	if (!element) return;

	const el = element instanceof HTMLElement ? element : element.element;
	const { itemId, containerId } = el.dataset;
	const id = itemId ?? containerId;

	if (id) return actor.items.get(id);
}
