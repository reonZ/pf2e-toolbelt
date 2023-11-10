import { MODULE_ID } from '../module'
import { isPlayedActor } from '../shared/actor'
import { getFlag, setFlag, unsetFlag } from '../shared/flags'
import { registerWrapper } from '../shared/libwrapper'
import { subLocalize } from '../shared/localize'
import { isInstanceOf } from '../shared/misc'
import { templatePath } from '../shared/path'
import { getSetting } from '../shared/settings'

const ACTOR_PREPARE_DATA = 'CONFIG.Actor.documentClass.prototype.prepareData'
const DOCUMENT_SHEET_RENDER_INNER = 'DocumentSheet.prototype._renderInner'

export function registerShare() {
    return {
        settings: [
            {
                name: 'share',
                type: String,
                default: 'disabled',
                choices: ['disabled', 'enabled', 'force'],
                requiresReload: true,
            },
        ],
        init: () => {
            const share = getSetting('share')
            if (share === 'disabled') return

            registerWrapper(ACTOR_PREPARE_DATA, prepareData, 'WRAPPER')
            registerWrapper(DOCUMENT_SHEET_RENDER_INNER, documentSheetRenderInner, 'WRAPPER')

            Hooks.on('preUpdateActor', preUpdateActor)
            Hooks.on('deleteActor', deleteActor)
            Hooks.on('updateActor', updateActor)
        },
    }
}

async function documentSheetRenderInner(wrapped, ...args) {
    const inner = await wrapped(...args)
    if (!isInstanceOf(this, 'CreatureConfig')) return inner

    const actor = this.actor
    if (!isPlayedActor(actor) || !actor.isOfType('character', 'npc') || getSlaves(actor).size) return inner

    const masters = game.actors
        .filter(a => a.id !== actor.id && a.isOwner && isValidMaster(a))
        .map(actor => ({
            key: actor.id,
            label: actor.name,
        }))

    const group = await renderTemplate(templatePath('share/master'), {
        masters,
        master: getFlag(actor, 'share.master'),
        selectPath: `flags.${MODULE_ID}.share.master`,
        i18n: subLocalize('share.templates.master'),
    })

    inner.children().last().before(group)

    return inner
}

function deleteActor(actor) {
    removeSlaveFromMaster(actor)

    const slaves = getSlaves(actor)
    Promise.all(
        slaves.map(async slave => {
            unsetMaster(slave)
            await unsetFlag(slave, 'share.master')
        })
    )
}

function preUpdateActor(actor, updates) {
    const shareFlag = getProperty(updates, `flags.${MODULE_ID}.share`)
    if (shareFlag?.master) {
        const master = game.actors.get(shareFlag.master)
        if (isValidMaster(master)) {
            const hpSource = deepClone(master._source.system.attributes.hp)
            setProperty(updates, 'system.attributes.hp', hpSource)
        }
    } else {
        const master = getMaster(actor)
        const hpUpdate = getProperty(updates, 'system.attributes.hp')
        if (master && hpUpdate) {
            master.update({ system: { attributes: { hp: hpUpdate } } }, { noHook: true })
            delete updates.system.attributes.hp
        }
    }
}

function updateActor(actor, updates, options, userId) {
    const isOriginalUser = game.user.id === userId

    const shareFlag = getShareFlag(updates)
    if (shareFlag?.master !== undefined) {
        const slave = actor

        removeSlaveFromMaster(slave)

        if (shareFlag.master) {
            const master = game.actors.get(shareFlag.master)
            if (isValidMaster(master)) {
                setMaster(slave, master)
                addSlaveToMaster(master, slave)
            }
        } else {
            unsetMaster(slave)
        }
    }

    if (!isOriginalUser) return

    const slaves = getSlaves(actor)
    if (slaves.size) {
        const hpUpdate = getProperty(updates, 'system.attributes.hp')
        if (hpUpdate) {
            const data = { system: { attributes: { hp: hpUpdate } } }
            Promise.all(slaves.map(async slave => await slave.update(data, { noHook: true })))
        } else {
            Promise.all(slaves.map(async slave => await refreshActor(slave, updates)))
        }
    }
}

async function refreshActor(actor, data) {
    const share = getSetting('share')
    if (share === 'force') {
        await setFlag(actor, 'toggle', !getFlag(actor, 'toggle'))
    } else {
        actor.render(false, { action: 'update' })
        actor._updateDependentTokens(data)
    }
}

function prepareData(wrapped) {
    wrapped()

    const actor = this
    const masterId = getFlag(actor, 'share.master')
    const master = masterId ? game.actors.get(masterId) : undefined

    if (!isValidMaster(master)) return

    if (!getMaster(this)) {
        setMaster(this, master)
        addSlaveToMaster(master, this)
    }

    const hp = this.system.attributes.hp
    Object.defineProperty(actor.system.attributes, 'hp', {
        get() {
            const masterHp = master.system.attributes.hp
            transfertHpData(masterHp, hp)
            return hp
        },
        enumerable: true,
    })
}

function transfertHpData(from, to) {
    to.breakdown = from.breakdown
    to.max = from.max
    to.sp = deepClone(from.sp)
    to.temp = from.temp
    to.totalModifier = from.totalModifier
    to.value = from.value
    to._modifiers = from._modifiers.slice()
}

function getShareFlag(doc) {
    return getProperty(doc, `flags.${MODULE_ID}.share`)
}

function getSlaves(actor) {
    return getModuleProperty(actor, 'slaves') ?? new Collection()
}

function setMaster(actor, master) {
    setModuleProperty(actor, 'master', master)
}

function unsetMaster(actor) {
    deleteModuleProperty(actor, 'master')
}

function getMaster(actor) {
    return getModuleProperty(actor, 'master')
}

function isValidMaster(actor) {
    return actor && actor.type === 'character' && !getMaster(actor)
}

function getModuleProperty(doc, path) {
    return getProperty(doc, `modules.${MODULE_ID}.share.${path}`)
}

function setModuleProperty(doc, path, value) {
    setProperty(doc, `modules.${MODULE_ID}.share.${path}`, value)
}

function deleteModuleProperty(doc, path) {
    delete doc.modules?.[MODULE_ID]?.share?.[path]
}

function addSlaveToMaster(master, slave) {
    const slaves = getSlaves(master)
    setModuleProperty(master, 'slaves', slaves.set(slave.id, slave))
}

function removeSlaveFromMaster(slave) {
    const master = getMaster(slave)
    if (!master) return

    const slaves = getSlaves(master)
    slaves.delete(slave.id)
}
