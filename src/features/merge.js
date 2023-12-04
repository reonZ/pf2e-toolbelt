import { MultiCast } from '../apps/merge/multi'
import { MODULE_ID } from '../module'
import { getChatMessageClass, latestChatMessages } from '../shared/chat'
import { getFlag } from '../shared/flags'
import { createHook } from '../shared/hook'
import { localize } from '../shared/localize'
import { compareArrays } from '../shared/misc'
import { warn } from '../shared/notification'
import { templatePath } from '../shared/path'
import { getDamageRollClass } from '../shared/pf2e/classes'
import { getSetting } from '../shared/settings'

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
    const item = message.item
    if (!item) return

    const spellBtn = html.find('.message-content .chat-card .owner-buttons .spell-button')

    spellBtn
        .find('[data-action=spell-damage]')
        .after(`<button data-action="multi-cast">${localize('merge.spell.button')}</button>`)

    spellBtn.find('[data-action=multi-cast]').on('click', event => {
        new MultiCast(event, message).render(true)
    })
}

function renderDamage(message, html) {
    let buttons = '<span class="pf2e-toolbelt-merge">'

    if (getFlag(message, 'merge.merged')) {
        const tooltip = localize('merge.damage.split-tooltip')
        buttons += `<button data-action="split-damage" title="${tooltip}">`
        buttons += '<i class="fa-duotone fa-split"></i>'
    }

    const tooltip = localize('merge.damage.tooltip')
    buttons += `<button data-action="merge-damage" title="${tooltip}">`
    buttons += '<i class="fa-duotone fa-merge"></i></button>'

    buttons += '</span>'

    const actorUUID = getActorUUID(message)
    const targetUUIDs = getTargetUUIDs(message)

    html.find('.dice-result .dice-total').append(buttons)
    html.find('.pf2e-toolbelt-merge [data-action=merge-damage]').on('click', event => {
        event.stopPropagation()

        for (const otherMessage of latestChatMessages(5, message)) {
            const otherTargetsUUIDS = getTargetUUIDs(otherMessage)

            if (
                !isDamageRoll(otherMessage) ||
                getActorUUID(otherMessage) !== actorUUID ||
                !compareArrays(
                    targetUUIDs?.map(t => t.actor).filter(Boolean),
                    otherTargetsUUIDS?.map(t => t.actor).filter(Boolean)
                )
            )
                continue

            mergeDamages(event, message, otherMessage, { actorUUID, targetUUIDs })
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
    const sources = getFlag(message, 'merge.data').flatMap(data => data.source)
    await removeChatMessages(message.id)
    await getChatMessageClass().createDocuments(sources)
}

async function mergeDamages(event, origin, other, { actorUUID, targetUUIDs }) {
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

    for (const roll of [].concat(otherRolls, originRolls)) {
        const { options, total, terms } = roll
        const term = terms[0]
        const formula = roll.formula
            .replaceAll(/(\[[\w,]+\])/g, '')
            .replace(/^\(/, '')
            .replace(/\)$/, '')
        const group = groupedRolls.find(
            ({ options: { flavor, critRule } }) => flavor === options.flavor && critRule === options.critRule
        )

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

    const DamageRoll = getDamageRollClass()
    for (const group of groupedRolls) {
        if (group.options.flavor.includes('persistent')) {
            const { index } = group.formulas.reduce(
                (acc, curr, index) => {
                    const value = new DamageRoll(curr).expectedValue
                    if (value > acc.value) acc = { value, index }
                    return acc
                },
                { value: 0, index: -1 }
            )

            group.formulas = [group.formulas[index]]
            group.terms = [group.terms[index]]
        }

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

    if (game.modules.get('dice-so-nice')?.active) {
        const setHidden = term => {
            if ('results' in term) {
                term.results.forEach(result => (result.hidden = true))
            } else {
                ;(term.term ?? term).operands?.forEach(operand => setHidden(operand))
            }
        }

        roll.terms[0].rolls.forEach(roll => roll.terms.forEach(term => setHidden(term)))
    }

    await removeChatMessages(origin.id, other.id)

    await getChatMessageClass().create({
        flavor,
        type: CONST.CHAT_MESSAGE_TYPES.ROLL,
        speaker: origin.speaker,
        flags: {
            [MODULE_ID]: {
                merge: {
                    actor: actorUUID,
                    targets: targetUUIDs,
                    merged: true,
                    type: 'damage-roll',
                    data,
                },
                target: {
                    targets: targetUUIDs,
                },
            },
            pf2e: {
                context: {
                    options: Array.from(new Set(data.flatMap(entry => entry.itemTraits))),
                },
            },
        },
        rolls: [roll],
    })
}

function getMessageData(message) {
    const flags = getFlag(message, 'merge.data')
    if (flags) return flags

    const source = message.toObject()
    delete source._id
    delete source.timestamp

    const html = $(`<div>${message.flavor}</div>`)
    const tags = html.find('h4.action + .tags').prop('outerHTML')

    const modifiers = []
    html.find('.tag.tag_transparent').each(function () {
        modifiers.push(this.innerHTML)
    })

    const notes = source.flags.pf2e.context.notes.map(
        ({ title, text }) => `<strong>${game.i18n.localize(title)}</strong> ${game.i18n.localize(text)}`
    )

    return [
        {
            source,
            name: source.flags.pf2e.strike?.name ?? message.item.name,
            outcome: source.flags.pf2e.context.outcome,
            itemTraits: source.flags.pf2e.context.options.filter(option => option.startsWith('item:')),
            modifiers,
            tags,
            notes,
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
    return getFlag(message, 'merge.rolls') ?? JSON.parse(message._source.rolls[0]).terms[0].rolls
}

function getActorUUID(message) {
    return getFlag(message, 'merge.actor') ?? message.actor?.uuid
}

function getTargetUUIDs(message) {
    const targetTargets = getFlag(message, 'target.targets')
    if (targetTargets) return targetTargets

    const mergeTargets = getFlag(message, 'merge.targets') ?? message.getFlag('pf2e', 'target')
    if (Array.isArray(mergeTargets)) return mergeTargets
    return mergeTargets ? [mergeTargets] : []
}

function isDamageRoll(message) {
    return getFlag(message, 'merge.type') === 'damage-roll' || message.getFlag('pf2e', 'context.type') === 'damage-roll'
}
