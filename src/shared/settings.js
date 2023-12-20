import { MODULE_ID } from '../module'

export function getSetting(setting) {
    return game.settings.get(MODULE_ID, setting)
}

export function setSetting(key, value) {
    return game.settings.set(MODULE_ID, key, value)
}

export function choiceSettingIsEnabled(setting) {
    return getSetting(setting) !== 'disabled'
}
