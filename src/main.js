import { MODULE_ID, localize, warn } from './module'
import { registerArp } from './features/arp'
import { registerEffectsPanelHelper } from './features/effects'
import { registerGiveth } from './features/giveth'
import { registerKnowledges } from './features/knowledges'
import { registerMerge } from './features/merge'
import { registerNobulk } from './features/nobulk'
import { registerSpellsSummary } from './features/summary'
import { registerUnided } from './features/unided'

const FEATURES = [
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

    const settings = FEATURES.flatMap(({ settings = [] }) =>
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

    const module = game.modules.get(MODULE_ID)
    module.api = {}

    FEATURES.forEach(feature => {
        const { init, conflicts = [], api = [] } = feature

        if (isGM) {
            for (const id of conflicts) {
                const conflictingModule = game.modules.get(id)
                if (conflictingModule?.active) {
                    feature.conflicting = true
                    CONFLICTS.add(conflictingModule.title)
                }
            }
        }

        for (const apiFn of api) {
            module.api[apiFn.name] = apiFn
        }

        if (!feature.conflicting && init) init(isGM)
    })
})

Hooks.once('ready', () => {
    const isGM = game.user.isGM

    for (const { conflicting, ready } of FEATURES) {
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
}
