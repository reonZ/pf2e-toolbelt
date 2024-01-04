import { calculateDistanceBetweenPoints, getElementIndex } from "./misc";

/** @type {DraggableData | null} */
let dragData = null;

let DRAG_ID = 0;

/**
 * @template {DraggableOptions | DroppableOptions} T
 * @param {T} options
 * @param {OptionsFilter<T>} filters
 */
function cleanOptions(options, filters) {
	for (const [type, keys] of Object.entries(filters)) {
		for (const key of keys) {
			const option = options[key];
			// biome-ignore lint/suspicious/useValidTypeof: <explanation>
			if (!option || typeof option === type) continue;
			options[option] = undefined;
		}
	}
}

/**
 * @param {HTMLElement} target
 * @param {DraggableOptions} options
 */
export function makeDraggable(options) {
	if (!(options.element instanceof HTMLElement)) return;

	cleanOptions(options, {
		string: ["draggedClass", "group", "selector", "filter", "identifier"],
		number: ["triggerDistance"],
		boolean: ["cancelOnRightClick"],
		function: ["onCancel", "onDragEnd", "onDragStart"],
	});

	options.triggerDistance ??= 6;

	options.cancelOnRightClick ??= true;

	options.cursorImage ??= {};
	options.cursorImage.id =
		typeof options.cursorImage.id === "string" ? options.cursorImage.id : "";
	options.cursorImage.img =
		typeof options.cursorImage.img === "function"
			? options.cursorImage.img
			: undefined;

	options.droppables ??= [];

	for (let i = options.droppables.length - 1; i >= 0; i--) {
		const droppable = options.droppables[i];

		if (!(droppable.element instanceof HTMLElement)) {
			options.droppables.splice(i, 1);
			continue;
		}

		cleanOptions(droppable, {
			string: ["selector", "overClass", "filter"],
			boolean: ["purgeOnLeave"],
			function: ["onDragEnter", "onDragLeave", "onDragOver", "onDrop"],
		});
	}

	options.element.addEventListener("mousedown", (event) =>
		onMouseDown(event, options),
	);
}

/**
 * @param {MouseEvent} event
 */
async function onDragCancel(event) {
	if (!dragData) return;

	dragData.canceled = true;

	if (dragData.dragging && dragData.draggable.ghost) {
		dragData.draggable.ghost.reset();
	}

	if (dragData.dragging && dragData.options.onCancel) {
		await dragData.options.onCancel(event, dragData.draggable);
	}

	cleanUp();

	await onDragEnd(event);
}

/**
 * @param {MouseEvent} event
 */
async function onDragEnd(event) {
	if (!dragData) return;

	if (dragData.dragging && dragData.options.onDragEnd) {
		await dragData.options.onDragEnd(event, dragData.draggable, {
			canceled: dragData.canceled,
			dropped: dragData.dropped,
		});
	}

	window.removeEventListener("mousemove", onMouseMove);
	window.removeEventListener("mouseup", onMouseUp);

	dragData = null;
}

function cleanUp() {
	if (!dragData) return;

	dragData.draggable.classList.purge();
	dragData.draggable.ghost?.classList.purge();
	dragData.cursorElement?.remove();

	for (const { classList } of Object.values(dragData.hovered)) {
		classList.purge();
	}
}

/**
 * @param {MouseEvent} event
 * @param {DraggableOptions} options
 */
function onMouseDown(event, options) {
	if (
		event.button === 2 &&
		dragData?.dragging &&
		dragData.options.cancelOnRightClick
	) {
		onDragCancel(event);
		return;
	}

	if (event.button) return;

	const target = closestInside(event.target, options.element, options);
	if (!target) return;

	/** @type {DraggableGhost | undefined} */
	let _ghost;

	const targetIndex = getElementIndex(target);
	const targetParent = target.parentElement;
	const targetClassList = newClassList(target);

	/** @type {DraggableData} */
	dragData = {
		canceled: false,
		dragging: false,
		dropped: false,
		options,
		group: options.group,
		draggable: {
			identifier: options.identifier,
			element: target,
			triggeringElement: event.target,
			x: event.clientX,
			y: event.clientY,
			parent: targetParent,
			index: targetIndex,
			classList: targetClassList,
			get ghost() {
				if (_ghost) {
					if (options.ghostClass) {
						_ghost.classList.add(options.ghostClass);
					}
					return _ghost;
				}

				const { element = target.cloneNode(true), index = Infinity } =
					options.createGhost?.(target, targetIndex) ?? {};

				const classList = newClassList(element);

				if (options.draggedClass && element !== target) {
					element.classList.remove(options.draggedClass);
				}

				if (options.ghostClass) {
					classList.add(options.ghostClass);
				}

				_ghost = {
					element,
					classList,
					index,
					reset: () => {
						element.remove();
						if (element === target) {
							const child = targetParent.children[targetIndex];
							targetParent.insertBefore(target, child);
							_ghost.index = targetIndex;
							if (options.ghostClass) {
								classList.remove(options.ghostClass);
							}
						} else {
							_ghost.index = Infinity;
						}
					},
				};

				return _ghost;
			},
			resetPosition: () => {
				target.remove();
				targetParent.children[targetIndex].before(target);
			},
		},
		droppables: options.droppables.map((droppable) => ({
			...droppable,
			id: DRAG_ID++,
		})),
		hovered: {},
	};

	window.addEventListener("mousemove", onMouseMove);
	window.addEventListener("mouseup", onMouseUp);
}

async function onMouseMove(event) {
	if (!dragData) return;

	if (dragData.dragging) {
		onDragMove(event);
		return;
	}

	const { clientX, clientY } = event;
	const { draggable } = dragData;
	const distance = calculateDistanceBetweenPoints(
		draggable.x,
		draggable.y,
		clientX,
		clientY,
	);

	if (distance > dragData.options.triggerDistance) {
		await onDragStart(event);
	}
}

/**
 * @param {MouseEvent} event
 */
async function onMouseUp(event) {
	if (event.button || !dragData) return;

	if (dragData.dragging) {
		let dropped = false;

		cleanUp();

		await Promise.all(
			Object.values(dragData.hovered).map(async (hovered) => {
				if (!hovered.droppable.onDrop) return;

				const hasDropped = await hovered.droppable.onDrop(
					event,
					dragData.draggable,
					{
						classList: hovered.classList,
						element: hovered.element,
						triggeringElement: hovered.triggeringElement,
					},
				);

				if (hasDropped) dropped = true;
			}),
		);

		dragData.dropped = dropped;
	}

	await onDragEnd(event);
}

/**
 * @param {MouseEvent} event
 */
async function onDragStart(event) {
	if (dragData.dragging) return;

	dragData.dragging = true;

	if (dragData.options.cursorImage.img) {
		const img = dragData.options.cursorImage.img(dragData.draggable.element);
		if (img instanceof HTMLElement) {
			dragData.cursorElement = img;
		} else {
			dragData.cursorElement = new Image();
			dragData.cursorElement.src = typeof img === "string" ? img : "";
		}
	} else {
		dragData.cursorElement = dragData.draggable.element.cloneNode(true);
	}

	dragData.cursorElement.id = dragData.options.cursorImage.id;

	if (dragData.options.draggedClass) {
		dragData.draggable.classList.add(dragData.options.draggedClass);
	}

	document.body.appendChild(dragData.cursorElement);

	await dragData.options.onDragStart?.(event, dragData.draggable);
}

/**
 * @param {MouseEvent} event
 */
async function onDragMove(event) {
	if (!dragData) return;

	const { clientX, clientY } = event;
	const cursorElement = dragData.cursorElement;

	const offsetX = cursorElement.offsetWidth / 2;
	const offsetY = cursorElement.offsetHeight / 2;

	cursorElement.style.left = `${clientX - offsetX}px`;
	cursorElement.style.top = `${clientY - offsetY}px`;

	await Promise.all(
		dragData.droppables.map(async (droppable) => {
			const target = closestInside(event.target, droppable.element, {
				selector: droppable.selector,
				filter: droppable.filter,
			});
			const hovered = dragData.hovered[droppable.id];

			if (hovered && (!target || hovered.element !== target)) {
				const left = await droppable.onDragLeave?.(event, dragData.draggable, {
					classList: hovered.classList,
					element: hovered.element,
					triggeringElement: event.target,
				});

				if (left !== false) {
					delete dragData.hovered[droppable.id];
					if (droppable.purgeOnLeave) {
						hovered.classList.purge();
					} else if (droppable.overClass) {
						hovered.classList.remove(droppable.overClass);
					}
				}
			}

			if (!target) return;

			if (!hovered) {
				const classList = newClassList(target);

				const entered = await droppable.onDragEnter?.(
					event,
					dragData.draggable,
					{
						classList,
						element: target,
						triggeringElement: event.target,
					},
				);

				if (entered !== false) {
					if (droppable.overClass) classList.add(droppable.overClass);

					dragData.hovered[droppable.id] = {
						id: droppable.id,
						classList,
						droppable,
						element: target,
						triggeringElement: event.target,
					};
				}
			} else if (droppable.onDragOver) {
				await droppable.onDragOver(event, dragData.draggable, {
					classList: hovered.classList,
					element: hovered.element,
					triggeringElement: event.target,
				});
			}
		}),
	);
}

/**
 *
 * @param {HTMLElement} target
 * @returns {DraggableClassList}
 */
export function newClassList(target) {
	return new (class extends Set {
		add(value) {
			target.classList.add(value);
			super.add(value);
		}
		remove(value) {
			target.classList.remove(value);
			super.delete(value);
		}
		toggle(value, enabled) {
			const toggled = enabled ?? !target.classList.contains(value);
			if (toggled) this.add(value);
			else this.remove(value);
		}
		contains(value) {
			return this.has(value);
		}
		purge() {
			target.classList.remove(...this);
		}
	})();
}

/**
 * @param {HTMLElement} target
 * @param {HTMLElement} parent
 * @param {Object} [options]
 * @param {string} [options.selector]
 * @param {string} [options.filter]
 * @returns {HTMLElement | undefined}
 */
export function closestInside(target, parent, { selector, filter } = {}) {
	if (!parent.contains(target)) return;

	if (!selector && !filter) return parent;

	let element;
	let cursor = target;

	while (true) {
		if (filter && cursor.matches(filter)) return;

		if (!element && selector && cursor.matches(selector)) {
			element = cursor;
		}

		if (cursor === parent) break;

		cursor = cursor.parentElement;
	}

	return !selector ? parent : element;
}
