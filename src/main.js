import { MODULE_ID, warn } from './module'
import { registerArp } from './modules/arp'
import { registerEffectsPanelHelper } from './modules/effects'
import { registerKnowledges } from './modules/knowledges'
import { registerNobulk } from './modules/nobulk'
import { registerUnided } from './modules/unided'

const MODULES = [registerArp(), registerNobulk(), registerKnowledges(), registerUnided(), registerEffectsPanelHelper()]
const CONFLICTS = new Set()

Hooks.once('init', () => {
    const user = game.data.users.find(x => x._id === game.data.userId)
    const isGM = user && user.role >= CONST.USER_ROLES.GAMEMASTER

    for (const module of MODULES) {
        const { settings = [], init, conflicts = [] } = module

        for (const setting of settings) {
            const name = setting.name

            if (setting.choices) {
                setting.choices = setting.choices.reduce((choices, choice) => {
                    choices[choice] = settingPath(name, `choices.${choice}`)
                    return choices
                }, {})
            }

            game.settings.register(MODULE_ID, name, {
                scope: 'world',
                config: true,
                ...setting,
                name: settingPath(name, 'name'),
                hint: settingPath(name, 'hint'),
            })
        }

        let conflicting = false
        for (const id of conflicts) {
            const conflictingModule = game.modules.get(id)
            if (conflictingModule?.active) {
                conflicting = true
                CONFLICTS.add(conflictingModule.title)
            }
        }

        if (conflicting) {
            module.conflicting = true
            continue
        }

        init?.(isGM)
    }
})

Hooks.once('ready', () => {
    const isGM = game.user.isGM

    for (const { conflicting, ready } of MODULES) {
        if (!conflicting && ready) ready(isGM)
    }

    for (const conflict of CONFLICTS) {
        warn('module-conflict', { name: conflict }, true)
    }
})

function settingPath(setting, key) {
    return `${MODULE_ID}.settings.${setting}.${key}`
}
