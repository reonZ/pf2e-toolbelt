import { MultiCast } from '../apps/merge/multi'
import { getSetting, localize } from '../module'
import { createHook } from './shared/hook'

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
            setHook(false, ['multi-cast', 'merge-damage'])
        },
    }
}

function updateMessages() {
    const chat = ui.chat?.element
    if (!chat) return

    const multi = getSetting('multi-cast')
    const merge = getSetting('merge-damage')
    const messages = Array.from(ui.chat.collection)

    for (let i = messages.length - 1; i >= messages.length - 11; i--) {
        const message = messages[i]
        if (!message) continue

        const html = chat.find(`[data-message-id=${message.id}]`)
        if (!html.length) continue

        if (!multi) html.find('[data-action=multi-cast]').remove()
        if (!merge) html.find('[data-action=merge-damage]').remove()

        renderChatMessage(message, html)
    }
}

function renderChatMessage(message, html) {
    const { type, uuid } = message.getFlag('pf2e', 'origin') ?? {}
    if (!type || !uuid) return

    if (type === 'spell' && getSetting('multi-cast')) renderSpell(html, uuid)
}

function renderSpell(html, uuid) {
    const spellBtn = html.find('.message-content .chat-card .owner-buttons .spell-button')

    spellBtn
        .find('[data-action=spell-damage]')
        .after(`<button data-action="multi-cast">${localize('merge.spell.button')}</button>`)

    spellBtn.find('[data-action=multi-cast]').on('click', async event => {
        const spell = await fromUuid(uuid)
        if (spell) new MultiCast(spell).render(true)
    })
}
