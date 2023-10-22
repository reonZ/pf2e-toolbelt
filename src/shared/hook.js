import { getSetting } from './settings'

export function createHook(event, listener, callback = () => {}) {
    let HOOK = null

    return function (value, otherSettings = [], skipCallback = false) {
        if (typeof otherSettings === 'string') otherSettings = [otherSettings]

        value ||= otherSettings.some(s => getSetting(s))

        if (value && !HOOK) {
            HOOK = Hooks.on(event, listener)
        } else if (!value && HOOK) {
            Hooks.off(event, HOOK)
            HOOK = null
        }

        if (!skipCallback) callback(value)
    }
}

export function createChoicesHook(event, listener, callback = () => {}) {
    let HOOK = null

    return function (value, skipCallback = false) {
        if (value === 'disabled' && HOOK) {
            Hooks.off(event, HOOK)
            HOOK = null
        } else if (value !== 'disabled' && !HOOK) {
            HOOK = Hooks.on(event, listener)
        }

        if (!skipCallback) callback(value)
    }
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
