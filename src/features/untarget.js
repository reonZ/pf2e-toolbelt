import { createHook } from '../shared/hook'
import { getSetting } from '../shared/settings'

const setHook = createHook('updateCombat', updateCombat)

export function registerUntarget() {
    return {
        settings: [
            {
                name: 'force-untarget',
                type: Boolean,
                default: false,
                onChange: setup,
            },
            {
                name: 'untarget',
                type: Boolean,
                default: false,
                scope: 'client',
                onChange: setup,
            },
        ],
        init: () => {
            setup()
        },
    }
}

function setup() {
    setHook(getSetting('force-untarget') || getSetting('untarget'))
}

function updateCombat(_, data) {
    if (!('turn' in data) && !('round' in data)) return

    const user = game.user
    user.updateTokenTargets()
    user.broadcastActivity({ targets: [] })
}
