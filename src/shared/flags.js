import { MODULE_ID } from '../module'

export function getFlag(doc, key, fallback) {
    return doc.getFlag(MODULE_ID, key) ?? fallback
}

export function setFlag(doc, key, value) {
    return doc.setFlag(MODULE_ID, key, value)
}
