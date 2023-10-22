function getSourceId(doc) {
    return doc.getFlag('core', 'sourceId')
}

function includesSourceId(doc, list) {
    const sourceId = getSourceId(doc)
    return sourceId ? list.includes(sourceId) : false
}

function getItemSourceIdCondition(sourceId) {
    return Array.isArray(sourceId) ? item => includesSourceId(item, sourceId) : item => getSourceId(item) === sourceId
}

export function getItems(actor, itemTypes) {
    itemTypes = typeof itemTypes === 'string' ? [itemTypes] : itemTypes
    return itemTypes ? itemTypes.flatMap(type => actor.itemTypes[type]) : actor.items
}

export function hasItemWithSourceId(actor, sourceId, itemTypes) {
    return getItems(actor, itemTypes).some(getItemSourceIdCondition(sourceId))
}

export function getItemWithSourceId(actor, sourceId, itemTypes) {
    return getItems(actor, itemTypes).find(getItemSourceIdCondition(sourceId))
}
