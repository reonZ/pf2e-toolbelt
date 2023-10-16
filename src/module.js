export const MODULE_ID = 'pf2e-toolbelt'

export function getSetting(setting) {
    return game.settings.get(MODULE_ID, setting)
}

export function setSetting(key, value) {
    return game.settings.set(MODULE_ID, key, value)
}

export function localize(...args) {
    let [key, data] = args
    key = `${MODULE_ID}.${key}`
    if (data) return game.i18n.format(key, data)
    return game.i18n.localize(key)
}

export function hasLocalization(key) {
    return game.i18n.has(`${MODULE_ID}.${key}`, false)
}

export function localizePath(key) {
    return `${MODULE_ID}.${key}`
}

export function subLocalize(subKey) {
    const fn = (...args) => localize(`${subKey}.${args[0]}`, args[1])

    Object.defineProperties(fn, {
        warn: {
            value: (...args) => warn(`${subKey}.${args[0]}`, args[1], args[2]),
            enumerable: false,
            configurable: false,
        },
        info: {
            value: (...args) => info(`${subKey}.${args[0]}`, args[1], args[2]),
            enumerable: false,
            configurable: false,
        },
        error: {
            value: (...args) => error(`${subKey}.${args[0]}`, args[1], args[2]),
            enumerable: false,
            configurable: false,
        },
        has: {
            value: key => hasLocalization(`${subKey}.${key}`),
            enumerable: false,
            configurable: false,
        },
        path: {
            value: key => localizePath(`${subKey}.${key}`),
            enumerable: false,
            configurable: false,
        },
        template: {
            value: (key, { hash }) => fn(key, hash),
            enumerable: false,
            configurable: false,
        },
    })

    return fn
}

function notify(str, arg1, arg2, arg3) {
    const type = typeof arg1 === 'string' ? arg1 : 'info'
    const data = typeof arg1 === 'object' ? arg1 : typeof arg2 === 'object' ? arg2 : undefined
    const permanent = typeof arg1 === 'boolean' ? arg1 : typeof arg2 === 'boolean' ? arg2 : arg3 ?? false

    ui.notifications.notify(localize(str, data), type, { permanent })
}

export function warn(...args) {
    const [str, arg1, arg2] = args
    notify(str, 'warning', arg1, arg2)
}

export function info(...args) {
    const [str, arg1, arg2] = args
    notify(str, 'info', arg1, arg2)
}

export function error(...args) {
    const [str, arg1, arg2] = args
    notify(str, 'error', arg1, arg2)
}

export function registerWrapper(path, callback, type) {
    libWrapper.register(MODULE_ID, path, callback, type)
}

export function getFlag(doc, key, fallback) {
    return doc.getFlag(MODULE_ID, key) ?? fallback
}

export function setFlag(doc, key, value) {
    return doc.setFlag(MODULE_ID, key, value)
}

export function templatePath(...path) {
    path = path.filter(x => typeof x === 'string')
    return `modules/${MODULE_ID}/templates/${path.join('/')}.hbs`
}

export function localeCompare(a, b) {
    return a.localeCompare(b, game.i18n.lang)
}

export function socketOn(callback) {
    game.socket.on(`module.${MODULE_ID}`, callback)
}

export function socketOff(callback) {
    game.socket.off(`module.${MODULE_ID}`, callback)
}

export function socketEmit(packet) {
    game.socket.emit(`module.${MODULE_ID}`, packet)
}

export function isActiveGM() {
    return game.user === game.users.activeGM
}

export function registerUpstreamHook(hook, fn) {
    const id = Hooks.on(hook, fn)
    const index = Hooks.events[hook].findIndex(x => x.id === id)

    if (index !== 0) {
        const [hooked] = Hooks.events[hook].splice(index, 1)
        Hooks.events[hook].unshift(hooked)
    }

    return id
}

export function isGMOnline() {
    return game.users.some(user => user.active && user.isGM)
}

export function chatUUID(uuid, label, fake = false) {
    if (fake) {
        return `<span style="background: #DDD; padding: 1px 4px; border: 1px solid var(--color-border-dark-tertiary);
border-radius: 2px; white-space: nowrap; word-break: break-all;">${label}</span>`
    } else {
        if (label) return `@UUID[${uuid}]{${label}}`
        return `@UUID[${uuid}]`
    }
}

export function getSourceId(doc) {
    return doc.getFlag('core', 'sourceId')
}

export function includesSourceId(doc, list) {
    const sourceId = getSourceId(doc)
    return sourceId ? list.includes(sourceId) : false
}

function getItemSourceIdCondition(sourceId) {
    return Array.isArray(sourceId) ? item => includesSourceId(item, sourceId) : item => getSourceId(item) === sourceId
}

export function hasItemWithSourceId(actor, sourceId, itemTypes) {
    return getItems(actor, itemTypes).some(getItemSourceIdCondition(sourceId))
}

export function getItemWithSourceId(actor, sourceId, itemTypes) {
    return getItems(actor, itemTypes).find(getItemSourceIdCondition(sourceId))
}

export function getItems(actor, itemTypes) {
    itemTypes = typeof itemTypes === 'string' ? [itemTypes] : itemTypes
    return itemTypes ? itemTypes.flatMap(type => actor.itemTypes[type]) : actor.items
}

export function refreshCharacterSheets(actor) {
    for (const win of Object.values(ui.windows)) {
        const winActor = win.actor
        if (!(win instanceof ActorSheet) || !winActor.isOfType('character')) continue
        if (!actor || actor === winActor) win.render()
    }
}

export function documentUuidFromTableResult(result) {
    if (result.type === CONST.TABLE_RESULT_TYPES.TEXT) return /@UUID\[([\w\.]+)\]/.exec(result.text)?.[1]
    if (result.type === CONST.TABLE_RESULT_TYPES.DOCUMENT) return `${result.documentCollection}.${result.documentId}`
    if (result.type === CONST.TABLE_RESULT_TYPES.COMPENDIUM) return `Compendium.${result.documentCollection}.${result.documentId}`
    return undefined
}

export function getCharacterOwner(actor, connected = false) {
    if (connected) return game.users.find(x => x.active && x.character === actor)
    return game.users.find(x => x.character === actor)
}

export function getOwner(doc, connected = false) {
    if (connected) return game.users.find(x => x.active && doc.testUserPermission(x, 'OWNER'))
    return game.users.find(x => doc.testUserPermission(x, 'OWNER'))
}

export function getActiveOwner(doc) {
    const activeOwners = game.users.filter(user => user.active && !user.isGM && doc.testUserPermission(user, 'OWNER'))
    activeOwners.sort((a, b) => (a.id > b.id ? 1 : -1))
    return activeOwners[0] || null
}

export function isActiveOwner(doc) {
    return getActiveOwner(doc) === game.user
}

export function* latestChatMessages(nb, fromMessage) {
    const messages = game.messages.contents
    const start = (fromMessage ? messages.findLastIndex(m => m === fromMessage) : messages.length) - 1

    for (let i = start; i >= start - nb; i--) {
        const message = messages[i]
        if (!message) return
        yield message
    }
}

export function compareArrays(arr1, arr2) {
    if (arr1.length !== arr2.length) return false

    const clonedArr2 = arr2.slice()

    for (const arr1Value of arr1) {
        const index = clonedArr2.findIndex(arr2Value => arr1Value === arr2Value)
        if (index === -1) return false
        clonedArr2.splice(index, 1)
    }

    return true
}

export function getChatMessageClass() {
    return CONFIG.ChatMessage.documentClass
}
