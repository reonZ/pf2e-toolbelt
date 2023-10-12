import { getSetting, latestChatMessages } from '../module'
import { createChoicesHook } from './shared/hook'

const setHook = createChoicesHook('renderChatMessage', renderChatMessage, updateMessages)

export function registerHideModifiers() {
    return {
        settings: [
            {
                name: 'modifiers',
                type: String,
                default: 'disabled',
                choices: ['disabled', 'enabled', 'traits'],
                onChange: value => setHook(value),
            },
        ],
        init: isGM => {
            if (!isGM && getSetting('modifiers') !== 'disabled') setHook(true, true)
        },
    }
}

function updateMessages() {
    if (game.user.isGM) return

    const chat = ui.chat?.element
    if (!chat) return

    for (const message of latestChatMessages(20)) {
        const html = chat.find(`[data-message-id=${message.id}]`)
        if (!html.length) continue

        html.find('.message-header').removeClass('pf2e-toolbelt-modifiers pf2e-toolbelt-modifiers-traits')
        renderChatMessage(message, html)
    }
}

function renderChatMessage(message, html) {
    const speaker = message.speaker
    const actor = ChatMessage.getSpeakerActor(speaker)
    if (!actor || actor.hasPlayerOwner) return

    const header = html.find('.message-header')

    if (getSetting('modifiers') === 'traits') {
        header.addClass('pf2e-toolbelt-modifiers-traits')
    }

    if (getSetting('modifiers') !== 'disabled') {
        header.addClass('pf2e-toolbelt-modifiers')
    }
}
