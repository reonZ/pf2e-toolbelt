import { getSetting } from '../module'

let CREATE_HOOK = null
let UPDATE_HOOK = null

export function registerUnided() {
    return {
        settings: [
            {
                name: 'unided',
                type: String,
                default: 'disabled',
                choices: ['disabled', 'create', 'all'],
                onChange: setHooks,
            },
        ],
        conflicts: ['pf2e-unided'],
        init: () => {
            setHooks()
        },
    }
}

function setHooks(value) {
    value ??= getSetting('unided')

    if (value === 'disabled') {
        if (CREATE_HOOK) {
            Hooks.off('preCreateItem', CREATE_HOOK)
            CREATE_HOOK = null
        }
        if (UPDATE_HOOK) {
            Hooks.off('preUpdateItem', UPDATE_HOOK)
            UPDATE_HOOK = null
        }
    } else {
        if (!CREATE_HOOK) {
            CREATE_HOOK = Hooks.on('preCreateItem', preCreateItem)
        }
        if (value === 'all' && !UPDATE_HOOK) {
            UPDATE_HOOK = Hooks.on('preUpdateItem', preUpdateItem)
        } else if (value !== 'all' && UPDATE_HOOK) {
            Hooks.off('preUpdateItem', UPDATE_HOOK)
            UPDATE_HOOK = null
        }
    }
}

function preCreateItem(item) {
    if (!item.img || !item.isOfType('physical')) return
    item._source.system.identification.unidentified.img = item.img
}

function preUpdateItem(item, changes) {
    if (!item.isOfType('physical') || !('img' in changes)) return
    setProperty(changes, 'system.identification.unidentified.img', changes.img)
}
