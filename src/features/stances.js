import { getSetting, hasItemWithSourceId, info, refreshCharacterSheets, subLocalize, templatePath } from '../module'
import { createHook } from './shared/hook'

const setSheetHook = createHook('renderCharacterSheetPF2e', renderCharacterSheetPF2e)
const setDeleteCombatHook = createHook('deleteCombat', deleteCombat)
const setDeleteCombatantHook = createHook('deleteCombatant', deleteCombatant)
const setCreateCombatantHook = createHook('createCombatant', createCombatant)

const STANCES = new Map()
const EFFECTS = new Set()

const STANCE_SAVANT = ['Compendium.pf2e.feats-srd.Item.yeSyGnYDkl2GUNmu', 'Compendium.pf2e.feats-srd.Item.LI9VtCaL5ZRk0Wo8']

const REPLACERS = new Map([
    [
        'Compendium.pf2e.feats-srd.Item.xQuNswWB3eg1UM28', // cobra envenom

        {
            replace: 'Compendium.pf2e.feats-srd.Item.AkV4Jyllo6nlK2Sl', // cobra stance
            effect: 'Compendium.pf2e.feat-effects.Item.2Qpt0CHuOMeL48rN',
        },
    ],
    [
        'Compendium.pf2e.feats-srd.Item.nRjyyDulHnP5OewA', // gorilla pound

        {
            replace: 'Compendium.pf2e.feats-srd.Item.DqD7htz8Sd1dh3BT', // gorilla stance
            effect: 'Compendium.pf2e.feat-effects.Item.UZKIKLuwpQu47feK',
        },
    ],
])

const EXTRAS = [
    {
        uuid: 'Compendium.pf2e.classfeatures.Item.09iL38CZZEa0q0Mt', // arcane cascade
        effect: 'Compendium.pf2e.feat-effects.Item.fsjO5oTKttsbpaKl',
        action: 'Compendium.pf2e.actionspf2e.Item.HbejhIywqIufrmVM',
    },
]

export function registerStances() {
    return {
        name: 'stances',
        settings: [
            {
                name: 'stances',
                type: Boolean,
                default: false,
                scope: 'client',
                onChange: setup,
            },
            {
                name: 'custom-stances',
                type: String,
                default: '',
                onChange: loadStances,
            },
        ],
        conflicts: ['pf2e-stances'],
        api: { getPackStances, getStances, toggleStance, isValidStance, getActionsUUIDS },
        init: isGm => {},
        ready: isGm => {
            if (getSetting('stances')) setup(true)
        },
    }
}

function setup(value) {
    setSheetHook(value)
    setDeleteCombatHook(value)
    setDeleteCombatantHook(value)
    setCreateCombatantHook(value)
    loadStances()
}

async function loadStances() {
    if (!getSetting('stances')) return

    STANCES.clear()
    EFFECTS.clear()

    async function addStances(pack) {
        const stances = await getPackStances(pack)
        stances.forEach(stance => {
            if (STANCES.has(stance.uuid)) return
            STANCES.set(stance.uuid, stance)
        })
    }

    const pack = game.packs.get('pf2e.feats-srd')
    await addStances(pack)

    EXTRAS.forEach(({ uuid, effect }) => {
        const { name } = fromUuidSync(uuid)
        STANCES.set(uuid, { uuid, name, effect })
    })

    const customStances = getSetting('custom-stances').split(',')
    await Promise.all(
        customStances.map(async custom => {
            const trimmed = custom.trim()

            const pack = game.packs.get(trimmed)
            if (pack) {
                await addStances(pack)
                return
            }

            const stance = fromUuidSync(trimmed)
            if (!stance) return

            const usableUuid = stance.sourceId ?? stance.uuid
            if (!usableUuid || !isValidStance(stance) || STANCES.has(usableUuid)) return

            STANCES.set(usableUuid, {
                uuid: usableUuid,
                name: stance.name,
                effect: stance.system.selfEffect.uuid,
            })
        })
    )

    STANCES.forEach(stance => EFFECTS.add(stance.effect))
    REPLACERS.forEach(replacer => EFFECTS.add(replacer.effect))

    refreshCharacterSheets()
}

function isValidStance(stance) {
    return stance && stance.system.traits.value.includes('stance') && stance.system.selfEffect?.uuid
}

async function getPackStances(pack) {
    const index = await pack.getIndex({ fields: ['system.traits', 'system.selfEffect'] })
    return index.filter(isValidStance).map(feat => ({
        name: feat.name,
        uuid: feat.uuid,
        effect: feat.system.selfEffect.uuid,
    }))
}

async function getStances(actor) {
    const stances = []
    const replaced = []
    const effects = new Map()

    for (const feat of actor.itemTypes.feat) {
        const sourceId = feat.sourceId

        const replacer = REPLACERS.get(sourceId)
        const stance = STANCES.get(replacer?.replace ?? sourceId)
        if (!stance) continue

        stances.push({
            name: stance.name,
            uuid: sourceId,
            effectUUID: replacer?.effect ?? stance.effect,
        })

        if (replacer) replaced.push(replacer.replace)
    }

    for (const effect of actor.itemTypes.effect) {
        const sourceId = effect.sourceId
        if (EFFECTS.has(sourceId)) effects.set(sourceId, effect.id)
    }

    return Promise.all(
        stances
            .filter(({ uuid }) => !replaced.includes(uuid))
            .map(async ({ effectUUID, name }) => {
                const effect = await fromUuid(effectUUID)
                if (!effect) return

                return {
                    name,
                    img: effect.img,
                    effectUUID,
                    effectID: effects.get(effectUUID),
                }
            })
    ).then(stances => stances.filter(Boolean))
}

async function renderCharacterSheetPF2e(sheet, html) {
    const actor = sheet.actor
    const stances = await getStances(actor)
    if (!stances.length) return

    const inCombat = actor.getActiveTokens(true, true).some(token => token.inCombat)
    const tab = html.find('.sheet-body .sheet-content [data-tab=actions] .tab-content .actions-panels [data-tab=encounter]')
    const options = tab.find('.actions-options')
    const template = await renderTemplate(templatePath('stances/sheet'), {
        stances,
        canUseStances: inCombat && !actor.isDead,
        i18n: subLocalize('stances'),
    })

    if (options.length) options.after(template)
    else tab.prepend(template)

    html.find(
        '.sheet-body .sheet-content [data-tab=actions] .tab-content .actions-panels [data-tab=encounter] .pf2e-stances .pf2e-stances__stance'
    ).on('click', event => onToggleStance(event, actor))
}

async function onToggleStance(event, actor) {
    const target = event.currentTarget
    const canUseStances = target.closest('.pf2e-stances')?.classList.contains('can-use-stances')
    if (!event.ctrlKey && !canUseStances) return

    const effectUUID = target.dataset.effectUuid
    toggleStance(actor, effectUUID)
}

async function toggleStance(actor, effectUUID) {
    const effects = getEffects(actor)
    const already = effects.findIndex(effect => effect.uuid === effectUUID)

    let create = false

    if (already < 0) {
        create = true
    } else if (effects.length) {
        const other = effects.filter(effect => effect.uuid !== effectUUID).length
        const more = effects.filter(effect => effect.uuid === effectUUID).length > 1
        if (other || more) effects.splice(already, 1)
    }

    if (effects.length) {
        await actor.deleteEmbeddedDocuments(
            'Item',
            effects.map(x => x.id)
        )
    }

    if (create) addStance(actor, effectUUID)
}

async function addStance(actor, uuid) {
    const effect = await fromUuid(uuid)

    if (effect) {
        const obj = effect.toObject()
        if (!getProperty(obj, 'flags.core.sourceId')) setProperty(obj, 'flags.core.sourceId', effect.uuid)

        const items = await actor.createEmbeddedDocuments('Item', [obj])
        items[0]?.toMessage()

        return true
    }

    return false
}

function getEffects(actor) {
    const effects = []

    for (const effect of actor.itemTypes.effect) {
        const sourceId = effect.sourceId
        if (!sourceId || !EFFECTS.has(sourceId)) continue
        effects.push({ uuid: sourceId, id: effect.id })
    }

    return effects
}

function deleteCombat(combat) {
    for (const combatant of combat.combatants) {
        deleteCombatant(combatant)
    }
}

function deleteCombatant(combatant) {
    const actor = getActorFromCombatant(combatant)
    if (!actor) return

    if (game.user.isGM) {
        const effects = getEffects(actor).map(effect => effect.id)
        if (effects.length) actor.deleteEmbeddedDocuments('Item', effects)
    }

    refreshCharacterSheets(actor)
}

function createCombatant(combatant) {
    const actor = getActorFromCombatant(combatant)
    if (!actor) return

    if (!game.user.isGM && actor.isOwner) checkForSavant(actor)

    refreshCharacterSheets(actor)
}

function getActorFromCombatant(combatant) {
    const actor = combatant.actor
    if (actor && !actor.isToken && actor.isOfType('character')) return actor
}

async function checkForSavant(actor) {
    if (getEffects(actor).length) return
    if (!hasItemWithSourceId(actor, STANCE_SAVANT, ['feat'])) return

    const stances = await getStances(actor)
    if (!stances.length) return

    if (stances.length === 1) {
        const stance = stances[0]
        if (await addStance(actor, stance.effectUUID)) info('stances.useStance', { stance: stance.name })
    } else {
        openStancesMenu(actor, stances)
    }
}

async function openStancesMenu(actor, stances) {
    const localize = subLocalize('stances.menu')

    new Dialog({
        title: localize('title'),
        content: await renderTemplate(templatePath('stances/menu'), { stances, i18n: localize }),
        buttons: {
            yes: {
                icon: '<i class="fa-solid fa-people-arrows"></i>',
                label: localize('accept'),
                callback: html => addStance(actor, html.find('[name=stance]:checked').val()),
            },
            no: {
                icon: '<i class="fa-solid fa-xmark"></i>',
                label: localize('cancel'),
            },
        },
    }).render(true)
}

function getActionsUUIDS() {
    return new Set([
        ...Array.from(STANCES.keys()),
        ...EXTRAS.flatMap(({ uuid, action }) => [uuid, action]),
        ...Array.from(REPLACERS.keys()),
    ])
}
