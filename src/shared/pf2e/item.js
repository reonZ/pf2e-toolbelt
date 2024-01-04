export const HANDWRAPS_SLUG = "handwraps-of-mighty-blows";

export function canBeInvested(item) {
	return item.traits.has("invested");
}

export function hasWornSlot(item) {
	return item.system.equipped.inSlot != null;
}

export function isWornAs(item) {
	return item.system.usage.type === "worn" && item.system.equipped.inSlot;
}

export function isInvestedOrWornAs(item) {
	return item.isInvested || isWornAs(item);
}

export function isHandwrapsOfMightyBlows(item) {
	return (
		item.isOfType("weapon") &&
		item.slug === HANDWRAPS_SLUG &&
		item.category === "unarmed"
	);
}

export function isHeld(item) {
	return item.system.usage.type === "held";
}

export function isTwoHanded(item) {
	return isHeld(item) && item.system.usage.value === "held-in-two-hands";
}

export function isOneHanded(item) {
	return isHeld(item) && item.system.usage.value === "held-in-one-hand";
}

export function inSlotValue(item, value) {
	const usage = item.system.usage;
	return usage.type === "worn" && usage.where ? value : undefined;
}

export function toggleInvestedValue(item, invest) {
	const value = invest ?? !item.system.equipped.invested;
	return item.traits.has("invested") ? value : undefined;
}

export function itemCarryUpdate(
	item,
	{ carryType = "worn", handsHeld = 0, inSlot, invested, containerId },
) {
	const update = {
		_id: item.id,
		system: {
			equipped: {
				carryType: carryType,
				handsHeld: handsHeld,
				inSlot: inSlotValue(item, inSlot),
				invested: toggleInvestedValue(item, invested),
			},
		},
	};

	if (containerId !== undefined) {
		update.system.containerId = containerId;
	}

	return update;
}
