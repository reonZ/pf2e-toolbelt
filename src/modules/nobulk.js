import { getSetting, registerWrapper } from '../module'

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

    Object.defineProperty(actor.inventory, 'bulk', {
        get() {
            const inventoryBulk = new InventoryBulk(actor)
            inventoryBulk.value = InventoryBulk.computeTotalBulk(
                actor.inventory.filter(i => !i.isInContainer && i.system.equipped.carryType !== 'dropped'),
                actor.size
            )
            return inventoryBulk
        },
    })
}
