export function ErrorPF2e(message) {
    return Error(`PF2e System | ${message}`)
}

export function setHasElement(set, value) {
    return set.has(value)
}

export function isPhysicalData(source) {
    return setHasElement(PHYSICAL_ITEM_TYPES, source.type)
}

export function hasInvestedProperty(source) {
    return isPhysicalData(source) && 'invested' in source.system.equipped
}

export function localizer(prefix) {
    return (...[suffix, formatArgs]) =>
        formatArgs ? game.i18n.format(`${prefix}.${suffix}`, formatArgs) : game.i18n.localize(`${prefix}.${suffix}`)
}
