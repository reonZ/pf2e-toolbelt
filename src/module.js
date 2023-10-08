export const MODULE_ID = 'pf2e-toolbelt'

export function getSetting(setting) {
    return game.settings.get(MODULE_ID, setting)
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

export function registerWrapper(path, callback) {
    libWrapper.register(MODULE_ID, path, callback)
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
        return `@UUID[${uuid}]{${label}}`
    }
}
