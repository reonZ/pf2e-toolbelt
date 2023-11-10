import { MODULE_ID } from '../module'
import { isPlayedActor } from '../shared/actor'
import { getFlag } from '../shared/flags'
import { registerWrapper } from '../shared/libwrapper'
import { subLocalize } from '../shared/localize'
import { isInstanceOf } from '../shared/misc'
import { error } from '../shared/notification'
import { templatePath } from '../shared/path'
import { getSetting } from '../shared/settings'

const ACTOR_PREPARE_DATA = 'CONFIG.Actor.documentClass.prototype.prepareData'
const ACTOR_UNDO_DAMAGE = 'CONFIG.Actor.documentClass.prototype.undoDamage'

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
            registerWrapper(ACTOR_UNDO_DAMAGE, undoDamage, 'MIXED')

            registerWrapper(DOCUMENT_SHEET_RENDER_INNER, documentSheetRenderInner, 'WRAPPER')

            Hooks.on('preUpdateActor', preUpdateActor)
            Hooks.on('deleteActor', deleteActor)
            if (share !== 'force') Hooks.on('updateActor', updateActor)
        },
    }
}

async function documentSheetRenderInner(wrapped, ...args) {
    const inner = await wrapped(...args)
    if (!isInstanceOf(this, 'CreatureConfig')) return inner

    const actor = this.actor
    if (!isPlayedActor(actor) || !actor.isOfType('character', 'npc') || getSlaves(actor).size) return inner

    const masters = game.actors
        .filter(a => a.id !== actor.id && a.type === 'character' && a.isOwner && !getMaster(a))
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

async function undoDamage(wrapped, ...args) {
    const master = getMaster(this)
    if (master) error('share.noUndo')
    else wrapped(...args)
}

function deleteActor(actor) {
    removeSlaveFromMaster(actor)
}

function preUpdateActor(actor, updates) {
    const shareFlag = getProperty(updates, `flags.${MODULE_ID}.share`)
    if (shareFlag?.master !== undefined) {
        removeSlaveFromMaster(actor)

        if (shareFlag.master) {
            const master = game.actors.get(shareFlag.master)
            if (master?.isOfType('character') && !getMaster(master)) {
                setModuleProperty(actor, 'master', master)
                addSlaveToMaster(master, actor)
            }
        } else {
            deleteModuleProperty(actor, 'master')
        }
    }

    const hpUpdate = getProperty(updates, 'system.attributes.hp')
    if (hpUpdate) {
        if (getSetting('share') === 'force') {
            const slaves = getSlaves(actor)
            Promise.all(
                slaves.map(async slave => {
                    await slave.update({
                        [`flags.${MODULE_ID}.toggle`]: !getFlag(slave, 'toggle'),
                    })
                })
            )
        }

        const master = getMaster(actor)
        if (master) {
            master.update({ system: { attributes: { hp: hpUpdate } } }, { noHook: true })
            delete updates.system.attributes.hp
        }
    }
}

function updateActor(actor, updates) {
    const hpUpdate = getProperty(updates, 'system.attributes.hp')
    if (hpUpdate) {
        const slaves = getSlaves(actor)
        const data = { system: { attributes: { hp: hpUpdate } } }

        for (const slave of slaves) {
            slave.render(false, { action: 'update', data })
            slave._updateDependentTokens(data)
        }
    }
}

function prepareData(wrapped) {
    wrapped()

    const actor = this
    const masterId = getFlag(actor, 'share.master')
    const master = masterId ? game.actors.get(masterId) : undefined
    if (!master?.isOfType('character') || getMaster(master)) return

    setModuleProperty(this, 'master', master)
    addSlaveToMaster(master, this)

    const hp = this.system.attributes.hp

    Object.defineProperty(actor.system.attributes, 'hp', {
        get() {
            const masterHp = master.system.attributes.hp

            hp.breakdown = masterHp.breakdown
            hp.max = masterHp.max
            hp.sp = deepClone(masterHp.sp)
            hp.temp = masterHp.temp
            hp.totalModifier = masterHp.totalModifier
            hp.value = masterHp.value
            hp._modifiers = masterHp._modifiers.slice()

            return hp
        },
        enumerable: true,
    })
}

function getSlaves(actor) {
    return getModuleProperty(actor, 'slaves') ?? new Collection()
}

function getMaster(actor) {
    return getModuleProperty(actor, 'master')
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
