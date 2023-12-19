import { MODULE_ID } from '../module'

export function getSetting(setting) {
    return game.settings.get(MODULE_ID, setting)
}

export function setSetting(key, value) {
    return game.settings.set(MODULE_ID, key, value)
}

export function migrateBooleanToChoice(value, truthy) {
    return String(value) === 'false' ? 'disabled' : truthy
}

export function getChoiceSetting(setting) {
    const s = getSetting(setting)
    return String(s) === 'false' ? 'disabled' : s
}

export function choiceSettingIsEnabled(setting) {
    return getChoiceSetting(setting) !== 'disabled'
}
