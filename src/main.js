import { MODULE_ID, localize, warn } from './module'
import { registerArp } from './modules/arp'
import { registerEffectsPanelHelper } from './modules/effects'
import { registerGiveth } from './modules/giveth'
import { registerKnowledges } from './modules/knowledges'
import { registerMerge } from './modules/merge'
import { registerNobulk } from './modules/nobulk'
import { registerSpellsSummary } from './modules/summary'
import { registerUnided } from './modules/unided'

const MODULES = [
    registerArp(),
    registerNobulk(),
    registerGiveth(),
    registerKnowledges(),
    registerUnided(),
    registerMerge(),
    registerEffectsPanelHelper(),
    registerSpellsSummary(),
]

const CONFLICTS = new Set()

let firstClientSetting = null

Hooks.once('init', () => {
    const user = game.data.users.find(x => x._id === game.data.userId)
    const isGM = user && user.role >= CONST.USER_ROLES.GAMEMASTER

    const settings = MODULES.flatMap(({ settings = [] }) =>
        settings.map(setting => {
            const key = setting.name

            if (setting.choices) {
                setting.choices = setting.choices.reduce((choices, choice) => {
                    choices[choice] = settingPath(key, `choices.${choice}`)
                    return choices
                }, {})
            }

            setting.key = key
            setting.scope ??= 'world'
            setting.config ??= true
            setting.name = settingPath(key, 'name')
            setting.hint = settingPath(key, 'hint')

            return setting
        })
    )

    const [worldSettings, clientSettings] = ['world', 'client'].map(scope =>
        settings.filter(settings => settings.scope === scope)
    )

    ;[worldSettings, clientSettings].forEach(settings =>
        settings.forEach(setting => game.settings.register(MODULE_ID, setting.key, setting))
    )

    if (isGM) {
        firstClientSetting = clientSettings[0].key
        Hooks.on('renderSettingsConfig', renderSettingsConfig)
    }

    MODULES.forEach(({ init, conflicts = [] }) => {
        if (isGM) {
            for (const id of conflicts) {
                const conflictingModule = game.modules.get(id)
                if (conflictingModule?.active) {
                    module.conflicting = true
                    CONFLICTS.add(conflictingModule.title)
                }
            }
        }

        if (!module.conflicting && init) init(isGM)
    })
})

Hooks.once('ready', () => {
    const isGM = game.user.isGM

    for (const { conflicting, ready } of MODULES) {
        if (!conflicting && ready) ready(isGM)
    }

    if (isGM) {
        for (const conflict of CONFLICTS) {
            warn('module-conflict', { name: conflict }, true)
        }
    }
})

function settingPath(setting, key) {
    return `${MODULE_ID}.settings.${setting}.${key}`
}

function renderSettingsConfig(_, html) {
    if (!firstClientSetting) return

    const group = html.find(`.tab[data-tab=${MODULE_ID}] [data-setting-id="${MODULE_ID}.${firstClientSetting}"]`)
    group.before(`<h3>${localize('settings.client')}</h3>`)

    // function beforeGroup(name, key, dom = 'h3') {
    //     const localized = localize(`menu.${key}`)
    //     tab.find(`[name="${MODULE_ID}.${name}"]`).closest('.form-group').before(`<${dom}>${localized}</${dom}>`)
    // }

    // if (game.user.isGM) {
    //     beforeGroup('enabled', 'client.header', 'h2')
    // }

    // beforeGroup('saves', 'client.tooltip')
    // beforeGroup('distance', 'client.distance')
    // beforeGroup('height', 'client.sidebar')
    // beforeGroup('actions', 'client.actions')
    // beforeGroup('containers', 'client.items')
    // beforeGroup('spells', 'client.spells')
    // beforeGroup('untrained', 'client.skills')
}
