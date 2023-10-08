import { MoveLootPopup } from '../apps/giveth/popup'
import {
    chatUUID,
    getSetting,
    isActiveGM,
    isGMOnline,
    localize,
    registerUpstreamHook,
    socketEmit,
    socketOff,
    socketOn,
    warn,
} from '../module'

let enabled = false
let CANVAS_HOOK = null

export function registerGiveth() {
    return {
        settings: [
            {
                name: 'giveth',
                type: String,
                default: 'disabled',
                choices: ['disabled', 'enabled', 'no-message'],
                onChange: setup,
            },
        ],
        conflicts: ['pf2e-giveth'],
        ready: isGM => {
            if (getSetting('giveth') !== 'disabled') setup(true)
        },
    }
}

function setup(value) {
    const isGM = game.user.isGM

    if (value === 'disabled' && enabled) {
        if (isGM) socketOff(onSocket)
        else if (CANVAS_HOOK) {
            Hooks.off('dropCanvasData', CANVAS_HOOK)
            CANVAS_HOOK = null
        }
        enabled = false
    } else if (value !== 'disabled' && !enabled) {
        if (isGM) socketOn(onSocket)
        else if (!CANVAS_HOOK) CANVAS_HOOK = registerUpstreamHook('dropCanvasData', onDropCanvasData)
        enabled = true
    }
}

function onSocket(packet) {
    if (!isActiveGM()) return
    if (packet.type === 'giveth-condition') takethCondition(packet)
    else if (packet.type === 'giveth-effect') takethEffect(packet)
    else takethPhysical(packet)
}

function onDropCanvasData(canvas, data) {
    if (!isGMOnline()) return true

    const details = getDetailsFromData(data)
    if (!details) return true

    const target = canvas.tokens.placeables
        .slice()
        .filter(token => {
            if (!token.document.actorLink) return false
            const target = token.actor
            if (!isValidActor(target, data.actorId) || target.isOwner) return false
            const maximumX = token.x + (token.hitArea?.right ?? 0)
            const maximumY = token.y + (token.hitArea?.bottom ?? 0)
            return data.x >= token.x && data.y >= token.y && data.x <= maximumX && data.y <= maximumY
        })
        .sort((a, b) => b.document.sort - a.document.sort)
        .at(0)?.actor

    if (!target) return true

    giveth(details.actor, target, details.item, details.value)
    return false
}

function giveth(origin, target, item, value) {
    const ownerId = origin.id
    const targetId = target.id
    const isIndex = !(item instanceof Item)

    if (!isIndex && item.isOfType('physical')) {
        const qty = item.quantity
        if (qty < 1) return warn('giveth.notification.zero')

        if (qty === 1) return sendPhysicalRequest(ownerId, targetId, item.id, 1, false)

        new MoveLootPopup(origin, { maxQuantity: qty, lockStack: false, isPurchase: false }, (qty, stack) => {
            sendPhysicalRequest(ownerId, targetId, item.id, qty, stack)
        }).render(true)
    } else {
        const uuid = isIndex ? `Compendium.${item.pack}.${item._id}` : item.uuid
        if (item.type === 'condition') {
            socketEmit({
                type: 'giveth-condition',
                targetId,
                value: value ?? 1,
                uuid,
            })
        } else {
            socketEmit({
                type: 'giveth-effect',
                targetId,
                uuid,
            })
        }
    }
}

function sendPhysicalRequest(ownerId, targetId, itemId, qty, stack) {
    socketEmit({
        type: 'giveth-physical',
        ownerId,
        targetId,
        itemId,
        qty,
        stack,
    })
}

function isValidActor(actor, id) {
    if (!actor || (id && actor.id === id)) return false
    return actor.hasPlayerOwner && !actor.isToken && actor.isOfType('character', 'npc', 'vehicle')
}

function getDetailsFromData(data) {
    if (data.tokenId || data.type !== 'Item' || !data.uuid) return

    const item = fromUuidSync(data.uuid)
    if (!item) return

    let actor = item.actor
    if (!actor) {
        const actorUUID = data.context?.origin.actor
        actor = actorUUID ? fromUuidSync(actorUUID) : null
    }

    if (!isValidActor(actor) || !actor.isOwner) return

    const isIndex = !(item instanceof Item)
    if (isIndex && item.pack && ['effect', 'condition'].includes(item.type)) return { actor, item, value: data.value }
    if (!isIndex && item.isOfType('physical', 'effect')) return { actor, item, value: data.value }
}

async function takethCondition({ targetId, uuid, value }) {
    const target = game.actors.get(targetId)
    if (!target) return

    const item = await fromUuid(uuid)
    if (!item) return

    target.increaseCondition(item.slug, { min: value })
}

async function takethEffect({ targetId, uuid }) {
    const target = game.actors.get(targetId)
    if (!target) return

    const item = await fromUuid(uuid)
    if (!item) return

    const source = item.clone({ 'system.tokenIcon.show': true, 'system.unidentified': false }).toObject()
    target.createEmbeddedDocuments('Item', [source])
}

async function takethPhysical({ itemId, ownerId, qty, stack, targetId }) {
    const owner = game.actors.get(ownerId)
    const target = game.actors.get(targetId)
    if (!owner || !target) return

    const item = owner.items.get(itemId)
    if (!item) return

    qty = Math.min(qty, item.quantity)
    const newQty = item.quantity - qty

    const source = item.toObject()
    source.system.quantity = qty
    source.system.equipped.carryType = 'worn'
    if (item.isOfType('physical') && 'invested' in source.system.equipped) {
        source.system.equipped.invested = item.traits.has('invested') ? false : null
    }

    const newItem = await target.addToInventory(source, undefined, stack)
    if (!newItem) return

    if (newQty < 1) item.delete()
    else item.update({ 'system.quantity': newQty })

    if (getSetting('giveth') === 'no-message') return

    let content = chatUUID(newItem.uuid, newItem.name, !newItem.isIdentified)
    if (qty > 1) content += ` x${qty}`

    ChatMessage.create({
        flavor: `<h4 class="action">${localize('giveth.giveth', { target: target.name })}</h4>`,
        content,
        speaker: ChatMessage.getSpeaker({ actor: owner }),
    })
}
