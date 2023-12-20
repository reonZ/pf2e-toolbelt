export function applyStackingRules(modifiers) {
	let total = 0;
	const highestBonus = {};
	const lowestPenalty = {};

	// There are no ability bonuses or penalties, so always take the highest ability modifier.
	const abilityModifiers = modifiers.filter(
		(m) => m.type === "ability" && !m.ignored,
	);
	const bestAbility = abilityModifiers.reduce((best, modifier) => {
		if (best === null) {
			return modifier;
		}

		return modifier.force
			? modifier
			: best.force
			  ? best
			  : modifier.modifier > best.modifier
				  ? modifier
				  : best;
	}, null);
	for (const modifier of abilityModifiers) {
		modifier.ignored = modifier !== bestAbility;
	}

	for (const modifier of modifiers) {
		// Always disable ignored modifiers and don't do anything further with them.
		if (modifier.ignored) {
			modifier.enabled = false;
			continue;
		}

		// Untyped modifiers always stack, so enable them and add their modifier.
		if (modifier.type === "untyped") {
			modifier.enabled = true;
			total += modifier.modifier;
			continue;
		}

		// Otherwise, apply stacking rules to positive modifiers and negative modifiers separately.
		if (modifier.modifier < 0) {
			total += applyStacking(lowestPenalty, modifier, LOWER_PENALTY);
		} else {
			total += applyStacking(highestBonus, modifier, HIGHER_BONUS);
		}
	}

	return total;
}

function applyStacking(best, modifier, isBetter) {
	// If there is no existing bonus of this type, then add ourselves.
	const existing = best[modifier.type];
	if (existing === undefined) {
		modifier.enabled = true;
		best[modifier.type] = modifier;
		return modifier.modifier;
	}

	if (isBetter(modifier, existing)) {
		// If we are a better modifier according to the comparison, then we become the new 'best'.
		existing.enabled = false;
		modifier.enabled = true;
		best[modifier.type] = modifier;
		return modifier.modifier - existing.modifier;
	}

	// Otherwise, the existing modifier is better, so do nothing.
	modifier.enabled = false;
	return 0;
}
