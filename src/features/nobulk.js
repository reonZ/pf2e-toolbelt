import { registerWrapper } from '../shared/libwrapper'
import { getSetting } from '../shared/settings'

const ACTOR_PREPARE_EMBEDDED_DOCUMENTS = 'CONFIG.Actor.documentClass.prototype.prepareEmbeddedDocuments'

export function registerNobulk() {
    return {
        settings: [
            {
                name: 'nobulk',
                type: Boolean,
                default: false,
                requiresReload: true,
            },
        ],
        init: () => {
            if (!getSetting('nobulk')) return
            registerWrapper(ACTOR_PREPARE_EMBEDDED_DOCUMENTS, actorPrepareEmbeddedDocuments, 'WRAPPER')
        },
    }
}

function actorPrepareEmbeddedDocuments(wrapped, ...args) {
    wrapped(...args)

    const actor = this
    const InventoryBulk = actor.inventory.bulk.constructor

    let _value = null

    Object.defineProperty(actor.inventory.bulk, 'value', {
        get() {
            if (_value) return _value
            _value = InventoryBulk.computeTotalBulk(
                this.actor.inventory.filter(item => !item.isInContainer && item.system.equipped.carryType !== 'dropped'),
                this.actor.size
            )
            return _value
        },
    })
}
