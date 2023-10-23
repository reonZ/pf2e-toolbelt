import { registerWrapper } from '../shared/libwrapper'
import { getSetting } from '../shared/settings'

const ACTOR_PREPARE_EMBEDDED_DOCUMENTS = 'CONFIG.Actor.documentClass.prototype.prepareEmbeddedDocuments'
const TREASURE_PREPARE_BASE_DATA = 'CONFIG.PF2E.Item.documentClasses.treasure.prototype.prepareBaseData'

export function registerNobulk() {
    return {
        settings: [
            {
                name: 'nobulk',
                type: Boolean,
                default: false,
                requiresReload: true,
            },
            {
                name: 'nobulk-coins',
                type: Boolean,
                default: false,
                requiresReload: true,
            },
        ],
        init: () => {
            if (getSetting('nobulk')) registerWrapper(ACTOR_PREPARE_EMBEDDED_DOCUMENTS, actorPrepareEmbeddedDocuments, 'WRAPPER')
            if (getSetting('nobulk-coins')) registerWrapper(TREASURE_PREPARE_BASE_DATA, treasurePrepareBaseData, 'WRAPPER')
        },
    }
}

function treasurePrepareBaseData(wrapped) {
    wrapped()
    if (this.isCoinage) this.system.bulk.value = 0
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
