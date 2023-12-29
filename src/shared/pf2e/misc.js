export function ErrorPF2e(message) {
	return Error(`PF2e System | ${message}`);
}

let intlNumberFormat;
export function signedInteger(
	value,
	{ emptyStringZero = false, zeroIsNegative = false } = {},
) {
	if (value === 0 && emptyStringZero) return "";

	intlNumberFormat ??= new Intl.NumberFormat(game.i18n.lang, {
		maximumFractionDigits: 0,
		signDisplay: "always",
	});

	const maybeNegativeZero = zeroIsNegative && value === 0 ? -0 : value;

	return intlNumberFormat.format(maybeNegativeZero);
}

export function spellSlotGroupIdToNumber(groupId) {
	if (groupId === "cantrips") return 0;
	const numericValue = Number(groupId ?? NaN);
	return numericValue.between(0, 10) ? numericValue : null;
}

export function coerceToSpellGroupId(value) {
	if (value === "cantrips") return value;
	const numericValue = Number(value) || NaN;
	return numericValue.between(1, 10) ? numericValue : null;
}
