import { MultiCast } from '../apps/merge/multi'
import {
    MODULE_ID,
    compareArrays,
    getChatMessageClass,
    getFlag,
    getSetting,
    latestChatMessages,
    localize,
    subLocalize,
    templatePath,
    warn,
} from '../module'
import { createHook } from './shared/hook'

const FLAVOR_TAGS = /<div class="tags"><span class="tag".+?<\/div>/gm
const FLAVOR_MODIFIERS = /<span class="tag tag_transparent">(.+?)<\/span>/gm
const FORMULA_STRIP = /(\[[\w,]+\])/

const setHook = createHook('renderChatMessage', renderChatMessage, updateMessages)

export function registerMerge() {
    return {
        settings: [
            {
                name: 'merge-damage',
                type: Boolean,
                default: false,
                scope: 'client',
                onChange: value => setHook(value, 'multi-cast'),
            },
            {
                name: 'multi-cast',
                type: Boolean,
                default: false,
                scope: 'client',
                onChange: value => setHook(value, 'merge-damage'),
            },
        ],
        init: isGm => {
            setHook(false, ['multi-cast', 'merge-damage'], true)
        },
    }
}

function updateMessages() {
    const chat = ui.chat?.element
    if (!chat) return

    for (const message of latestChatMessages(10)) {
        const html = chat.find(`[data-message-id=${message.id}]`)
        if (!html.length) continue

        html.find('[data-action=multi-cast]').remove()
        html.find('[data-action=merge-damage]').remove()

        renderChatMessage(message, html)
    }
}

function renderChatMessage(message, html) {
    if (!game.user.isGM && !message.isAuthor) return
    if (getSetting('merge-damage') && isDamageRoll(message)) renderDamage(message, html)
    else if (getSetting('multi-cast') && message.getFlag('pf2e', 'origin.type') === 'spell') renderSpell(message, html)
}

function renderSpell(message, html) {
    const originUUID = message.getFlag('pf2e', 'origin.uuid')
    if (!originUUID) return

    const spellBtn = html.find('.message-content .chat-card .owner-buttons .spell-button')

    spellBtn
        .find('[data-action=spell-damage]')
        .after(`<button data-action="multi-cast">${localize('merge.spell.button')}</button>`)

    spellBtn.find('[data-action=multi-cast]').on('click', async event => {
        const spell = await fromUuid(originUUID)
        if (spell) new MultiCast(spell).render(true)
    })
}

function renderDamage(message, html) {
    let buttons = '<span class="pf2e-toolbelt-merge">'

    if (getFlag(message, 'merged')) {
        const tooltip = localize('merge.damage.split-tooltip')
        buttons += `<button data-action="split-damage" title="${tooltip}">`
        buttons += '<i class="fa-duotone fa-split"></i>'
    }

    const tooltip = localize('merge.damage.tooltip')
    buttons += `<button data-action="merge-damage" title="${tooltip}">`
    buttons += '<i class="fa-duotone fa-merge"></i></button>'

    buttons += '</span>'

    const actorUUID = getActorUUID(message)
    const targetUUID = getTargetUUID(message)

    html.find('.dice-result .dice-total').append(buttons)
    html.find('.pf2e-toolbelt-merge [data-action=merge-damage]').on('click', event => {
        event.stopPropagation()

        for (const otherMessage of latestChatMessages(5, message)) {
            if (
                !isDamageRoll(otherMessage) ||
                getActorUUID(otherMessage) !== actorUUID ||
                getTargetUUID(otherMessage) !== targetUUID
            )
                continue

            mergeDamages(event, message, otherMessage, { actorUUID, targetUUID })
            return
        }

        warn('merge.damage.none')
    })

    html.find('.pf2e-toolbelt-merge [data-action=split-damage]').on('click', event => {
        event.stopPropagation()
        splitDamages(event, message)
    })
}

async function splitDamages(event, message) {
    const sources = getFlag(message, 'data').flatMap(data => data.source)
    await removeChatMessages(message.id)
    await getChatMessageClass().createDocuments(sources)
}

async function mergeDamages(event, origin, other, { actorUUID, targetUUID }) {
    const dataGroups = {}

    const data = getMessageData(other).concat(getMessageData(origin))
    for (const { name, notes, outcome, modifiers, tags } of data) {
        dataGroups[name] ??= {
            name,
            tags,
            notes: new Set(),
            results: [],
        }

        notes.forEach(dataGroups[name].notes.add, dataGroups[name].notes)

        const exists = dataGroups[name].results.some(
            result => result.outcome === outcome && compareArrays(result.modifiers, modifiers)
        )

        if (!exists) dataGroups[name].results.push({ outcome, modifiers })
    }

    const groups = Object.values(dataGroups).map(group => {
        group.label = group.name
        group.results.forEach(result => {
            if (!result.outcome) return
            result.label = game.i18n.localize(`PF2E.Check.Result.Degree.Attack.${result.outcome}`)
        })
        return group
    })

    groups.at(-1).isLastGroup = true

    const flavor = await renderTemplate(templatePath('merge/merged'), {
        groups,
        hasMultipleGroups: groups.length > 1,
    })

    const originRolls = getMessageRolls(origin)
    const otherRolls = getMessageRolls(other)
    const groupedRolls = []

    function findGroup(options) {
        return groupedRolls.find(
            ({ options: { flavor, critRule } }) => flavor === options.flavor && critRule === options.critRule
        )
    }

    for (const roll of [].concat(otherRolls, originRolls)) {
        const { options, total, terms } = roll
        const term = terms[0]
        const formula = roll.formula.replace(FORMULA_STRIP, '')
        const group = findGroup(options)

        if (group) {
            group.terms.push(term)
            group.total += total
            group.formulas.push(formula)
        } else {
            groupedRolls.push({
                options,
                formulas: [formula],
                total,
                terms: [term],
            })
        }
    }

    for (const group of groupedRolls) {
        group.formula = `(${group.formulas.join(' + ')})[${group.options.flavor}]`
        group.term = group.terms.length < 2 ? group.terms[0] : createTermGroup(group.terms)
    }

    const roll = {
        class: 'DamageRoll',
        options: {},
        dice: [],
        formula: `{${groupedRolls.map(({ formula }) => formula).join(', ')}}`,
        total: groupedRolls.reduce((acc, { total }) => acc + total, 0),
        evaluated: true,
        terms: [
            {
                class: 'InstancePool',
                options: {},
                evaluated: true,
                terms: groupedRolls.map(({ formula }) => formula),
                modifiers: [],
                rolls: groupedRolls.map(({ options, formula, total, term }) => ({
                    class: 'DamageInstance',
                    options,
                    dice: [],
                    formula,
                    total,
                    terms: [term],
                    evaluated: true,
                })),
                results: groupedRolls.map(({ total }) => ({ result: total, active: true })),
            },
        ],
    }

    await removeChatMessages(origin.id, other.id)

    await getChatMessageClass().create({
        flavor,
        type: CONST.CHAT_MESSAGE_TYPES.ROLL,
        speaker: origin.speaker,
        flags: {
            [MODULE_ID]: {
                actor: actorUUID,
                target: targetUUID,
                merged: true,
                type: 'damage-roll',
                data,
            },
        },
        rolls: [roll],
    })
}

function getMessageData(message) {
    const flags = getFlag(message, 'data')
    if (flags) return flags

    const source = message.toObject()
    delete source._id
    delete source.timestamp

    return [
        {
            source,
            name: source.flags.pf2e.strike?.name ?? message.item.name,
            outcome: source.flags.pf2e.context.outcome,
            modifiers: getMessageModifiers(message),
            tags: message.flavor.match(FLAVOR_TAGS)?.[0] ?? '',
            notes: source.flags.pf2e.context.notes.map(
                ({ title, text }) => `<strong>${game.i18n.localize(title)}</strong> ${game.i18n.localize(text)}`
            ),
        },
    ]
}

function removeChatMessages(...ids) {
    const joinedIds = ids.map(id => `[data-message-id=${id}]`).join(', ')
    ui.chat.element.find(joinedIds).remove()
    return ChatMessage.deleteDocuments(ids)
}

function createTermGroup(terms) {
    const options = deepClone(terms[0].options)
    terms.map(term => ((term.options = {}), term))

    return {
        class: 'Grouping',
        options,
        evaluated: true,
        term: {
            class: 'ArithmeticExpression',
            options: {},
            evaluated: true,
            operator: '+',
            operands: [terms.shift(), terms.length > 1 ? createTermGroup(terms) : terms[0]],
        },
    }
}

function getMessageRolls(message) {
    return getFlag(message, 'rolls') ?? JSON.parse(message._source.rolls[0]).terms[0].rolls
}

function getActorUUID(message) {
    return getFlag(message, 'actor') ?? message.actor?.uuid
}

function getTargetUUID(message) {
    return getFlag(message, 'target') ?? message.target?.actor.uuid
}

function isDamageRoll(message) {
    return getFlag(message, 'type') === 'damage-roll' || message.getFlag('pf2e', 'context.type') === 'damage-roll'
}

function getMessageModifiers(message) {
    const modifiers = []

    let match
    while ((match = FLAVOR_MODIFIERS.exec(message.flavor))) {
        modifiers.push(match[1])
    }

    return modifiers
}
