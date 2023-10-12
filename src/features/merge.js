import { MultiCast } from '../apps/merge/multi'
import { MODULE_ID, getFlag, getSetting, latestChatMessages, localize, templatePath, warn } from '../module'
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
    const uuid = message.getFlag('pf2e', 'origin.uuid')
    if (!uuid) return

    const spellBtn = html.find('.message-content .chat-card .owner-buttons .spell-button')

    spellBtn
        .find('[data-action=spell-damage]')
        .after(`<button data-action="multi-cast">${localize('merge.spell.button')}</button>`)

    spellBtn.find('[data-action=multi-cast]').on('click', async event => {
        const spell = await fromUuid(uuid)
        if (spell) new MultiCast(spell).render(true)
    })
}

function renderDamage(message, html) {
    const uuid = getMessageUuid(message)
    if (!uuid) return

    const tooltip = localize('merge.damage.tooltip')
    const button = `<span class="pf2e-toolbelt-merge">
    <button data-action="merge-damage" title="${tooltip}" >
        <i class="fa-duotone fa-merge"></i>
    </button>
</span>`

    const originTarget = getMessageTarget(message)

    html.find('.dice-result .dice-total').append(button)
    html.find('[data-action=merge-damage]').on('click', event => {
        event.stopPropagation()

        for (const otherMessage of latestChatMessages(5, message)) {
            if (
                getMessageUuid(otherMessage) !== uuid ||
                getMessageTarget(otherMessage) !== originTarget ||
                !isDamageRoll(otherMessage)
            )
                continue

            mergeDamages(event, message, otherMessage)
            return
        }

        warn('merge.damage.none')
    })
}

async function mergeDamages(event, origin, other) {
    const name = getItemName(origin, other)
    const tags = getTags(origin, other)
    const notes = getMessageNotes(other)
    const modifiers = getMessageModifiers(other)

    const target = getMessageTarget(origin)
    const uuid = getMessageUuid(origin)

    for (const note of getMessageNotes(origin)) {
        if (!notes.includes(note)) notes.push(note)
    }

    for (const modifier of getMessageModifiers(origin)) {
        if (!modifiers.includes(modifier)) modifiers.push(modifier)
    }

    const originRolls = getMessageRolls(origin)
    const otherRolls = getMessageRolls(other)

    const grouped = []

    function findGroup(options) {
        return grouped.find(({ options: { flavor, critRule } }) => flavor === options.flavor && critRule === options.critRule)
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
            grouped.push({
                options,
                formulas: [formula],
                total,
                terms: [term],
            })
        }
    }

    for (const group of grouped) {
        group.formula = `(${group.formulas.join(' + ')})[${group.options.flavor}]`
        group.term = group.terms.length < 2 ? group.terms[0] : createTermGroup(group.terms)
    }

    const roll = {
        class: 'DamageRoll',
        options: {},
        dice: [],
        formula: `{${grouped.map(({ formula }) => formula).join(', ')}}`,
        total: grouped.reduce((acc, { total }) => acc + total, 0),
        evaluated: true,
        terms: [
            {
                class: 'InstancePool',
                options: {},
                evaluated: true,
                terms: grouped.map(({ formula }) => formula),
                modifiers: [],
                rolls: grouped.map(({ options, formula, total, term }) => ({
                    class: 'DamageInstance',
                    options,
                    dice: [],
                    formula,
                    total,
                    terms: [term],
                    evaluated: true,
                })),
                results: grouped.map(({ total }) => ({ result: total, active: true })),
            },
        ],
    }

    ui.chat.element.find(`[data-message-id=${origin.id}], [data-message-id=${other.id}]`).remove()
    await ChatMessage.deleteDocuments([origin.id, other.id])

    const flavor = await renderTemplate(templatePath('merge/merged'), {
        header: localize('merge.merged.header', { name }),
        tags,
        notes,
        modifiers,
    })

    await CONFIG.ChatMessage.documentClass.create({
        flavor,
        type: CONST.CHAT_MESSAGE_TYPES.ROLL,
        speaker: origin.speaker,
        flags: {
            [MODULE_ID]: {
                name,
                tags,
                notes,
                modifiers,
                uuid,
                type: 'damage-roll',
                target,
                merged: true,
            },
        },
        rolls: [roll],
    })
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

function getMessageUuid(message) {
    return getMessageFlag(message, 'origin.uuid', 'uuid')
}

function isDamageRoll(message) {
    return getMessageFlag(message, 'context.type', 'type') === 'damage-roll'
}

function getMessageTarget(message) {
    return getMessageFlag(message, 'context.target.token', 'target')
}

function getItemName(m1, m2) {
    return getFlag(m1, 'name') ?? getFlag(m2, 'name') ?? m1.getFlag('pf2e', 'strike.name') ?? m1.item.name
}

function getTags(m1, m2) {
    return getFlag(m1, 'tags') ?? getFlag(m2, 'tags') ?? m1.flavor.match(FLAVOR_TAGS)?.[0] ?? ''
}

function getMessageNotes(message) {
    return (
        getFlag(message, 'notes') ??
        message
            .getFlag('pf2e', 'context.notes')
            .map(({ title, text }) => `<strong>${game.i18n.localize(title)}</strong> ${game.i18n.localize(text)}`)
    )
}

function getMessageModifiers(message) {
    let modifiers = getFlag(message, 'modifiers')
    if (modifiers) return modifiers

    modifiers = []

    let match
    while ((match = FLAVOR_MODIFIERS.exec(message.flavor))) {
        modifiers.push(match[1])
    }

    return modifiers
}

function getMessageFlag(message, systemFlag, moduleFlag) {
    return message.getFlag('pf2e', systemFlag) ?? getFlag(message, moduleFlag)
}
