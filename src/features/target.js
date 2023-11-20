import { MODULE_ID } from '../module'
import { getFlag, updateSourceFlag } from '../shared/flags'
import { createHook } from '../shared/hook'
import { applyDamageFromMessage, onClickShieldBlock } from '../shared/pf2e'
import { getSetting } from '../shared/settings'
import { isUserGM } from '../shared/user'

const setPrecreateMessageHook = createHook('preCreateChatMessage', preCreateChatMessage)
const setRenderMessageHook = createHook('renderChatMessage', renderChatMessage)

export function registerTargetTokenHelper() {
    return {
        settings: [
            {
                name: 'target',
                type: Boolean,
                default: false,
                onChange: setup,
            },
        ],
        conflicts: [],
        init: () => {
            if (getSetting('target')) setup(true)
        },
    }
}

function setup(value) {
    if (!isUserGM()) return
    setPrecreateMessageHook(value)
    setRenderMessageHook(value)
}

function preCreateChatMessage(message) {
    if (!message.isDamageRoll) return

    const targets = game.user.targets
    if (targets.size < 1) return

    updateSourceFlag(
        message,
        'target.targets',
        Array.from(targets.map(target => ({ token: target.document.uuid, actor: target.actor.uuid })))
    )
}

async function renderChatMessage(message, html) {
    const targets = getFlag(message, 'target.targets') ?? []
    if (!targets.length) return

    const msgContent = html.find('.message-content')
    const damageRow = msgContent.find('.damage-application').clone()
    if (!damageRow.length) return

    damageRow.removeClass('damage-application').addClass('target-damage-application')
    damageRow.find('button > *:not(.label)').remove()

    const extraRows = $('<div class="target-helper"></div>')

    await Promise.all(
        targets.map(async ({ token }) => {
            const target = await fromUuid(token)
            if (!target) return

            extraRows.append('<hr>')

            extraRows.append(`<div class="target-header" data-target-uuid="${token}">
    <span class="name">${target.name}</span>
    <span class="controls">
        <a data-action="ping-target" data-tooltip="COMBAT.PingCombatant">
            <i class="fa-solid fa-fw fa-signal-stream"></i>
        </a>
        <a data-action="open-target-sheet" data-tooltip="PF2E.Actor.Party.Sidebar.OpenSheet">
            <i class="icon fa-solid fa-file"></i>
        </a>
    </span>
</div>`)

            const clone = damageRow.clone()
            clone.find('[data-action]').each(function () {
                const action = this.dataset.action
                this.dataset.action = `target-${action}`
            })

            clone.each((index, el) => {
                el.dataset.rollIndex = index
                el.dataset.targetUuid = token
            })

            extraRows.append(clone)
        })
    )

    msgContent.after(extraRows)

    extraRows.find('button[data-action^=target-]').on('click', event => onTargetButton(event, message))
    extraRows.find('[data-action=ping-target]').on('click', pingTarget)
    extraRows.find('[data-action=open-target-sheet]').on('click', openTargetSheet)
}

async function getTargetFromEvent(event) {
    const { targetUuid } = event.currentTarget.closest('[data-target-uuid]').dataset
    return fromUuid(targetUuid)
}

async function openTargetSheet(event) {
    const target = await getTargetFromEvent(event)
    if (!target) return

    target.actor.sheet.render(true)
}

async function pingTarget(event) {
    if (!canvas.ready) return

    const target = await getTargetFromEvent(event)
    if (!target) return

    canvas.ping(target.center)
}

async function onTargetButton(event, message) {
    const btn = event.currentTarget
    const { rollIndex, targetUuid } = btn.closest('[data-target-uuid]').dataset
    const target = await fromUuid(targetUuid)
    if (!target) return

    const type = btn.dataset.action

    if (type === 'target-shield-block') {
        onClickShieldBlock(target, btn, message.element)
        return
    }

    const multiplier =
        type === 'target-apply-healing'
            ? -1
            : type === 'target-half-damage'
            ? 0.5
            : type === 'target-apply-damage'
            ? 1
            : type === 'target-double-damage'
            ? 2
            : 3

    applyDamageFromMessage(target, {
        message,
        multiplier,
        addend: 0,
        promptModifier: event.shiftKey,
        rollIndex,
    })
}
