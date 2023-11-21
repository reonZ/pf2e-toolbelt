import { getFlag, updateSourceFlag } from '../shared/flags'
import { createHook } from '../shared/hook'
import { subLocalize } from '../shared/localize'
import { templatePath } from '../shared/path'
import { applyDamageFromMessage, onClickShieldBlock } from '../shared/pf2e'
import { getSetting } from '../shared/settings'
import { getTemplateTokens } from '../shared/template'

const setPrecreateMessageHook = createHook('preCreateChatMessage', preCreateChatMessage)
const setRenderMessageHook = createHook('renderChatMessage', renderChatMessage)
const setCreateTemplateHook = createHook('createMeasuredTemplate', createMeasuredTemplate)

export function registerTargetTokenHelper() {
    return {
        settings: [
            {
                name: 'target',
                type: Boolean,
                default: false,
                onChange: setHooks,
            },
            {
                name: 'target-chat',
                type: Boolean,
                default: false,
                scope: 'client',
                onChange: value => setRenderMessageHook(value && getSetting('target')),
            },
            {
                name: 'target-template',
                type: Boolean,
                default: false,
                scope: 'client',
                onChange: value => setCreateTemplateHook(value && getSetting('target')),
            },
        ],
        conflicts: [],
        init: () => {
            if (getSetting('target')) setHooks(true)
        },
    }
}

function setHooks(value) {
    setPrecreateMessageHook(value)
    setRenderMessageHook(value && getSetting('target-chat'))
    setCreateTemplateHook(value && getSetting('target-template'))
}

async function createMeasuredTemplate(template) {
    const localize = subLocalize('target.menu')
    const item = template.item
    const actor = item?.actor
    const self = !actor ? undefined : actor.token ?? actor.getActiveTokens()[0]

    const data = {
        title: item?.name || localize('title'),
        content: await renderTemplate(templatePath('target/template-menu'), { i18n: localize, noSelf: !self }),
        buttons: {
            select: {
                icon: '<i class="fa-solid fa-bullseye-arrow"></i>',
                label: localize('target'),
                callback: html => ({
                    targets: html.find('[name=targets]:checked').val(),
                    self: html.find('[name=self]').prop('checked'),
                    neutral: html.find('[name=neutral]').prop('checked'),
                }),
            },
        },
        close: () => null,
    }

    const result = await Dialog.wait(data, undefined, { id: `pf2e-toolbelt-target-template`, width: 260 })
    if (!result) return

    const user = game.user
    const alliance = actor ? actor.alliance : user.isGM ? 'opposition' : 'party'
    const opposition = alliance === 'party' ? 'opposition' : alliance === 'opposition' ? 'party' : null

    const targets = getTemplateTokens(template).filter(token => {
        if (!result.self && self && token === self) return false

        const targetAlliance = token.actor ? token.actor.alliance : token.alliance

        if (!result.neutral && targetAlliance === null) return false

        return (
            result.targets === 'all' ||
            (result.targets === 'allies' && targetAlliance === alliance) ||
            (result.targets === 'enemies' && targetAlliance === opposition)
        )
    })

    user.updateTokenTargets(targets.map(token => token.id))
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
    damageRow.find('[data-action]').each(function () {
        const action = this.dataset.action
        this.dataset.action = `target-${action}`
    })

    const extraRows = []

    await Promise.all(
        targets.map(async ({ token }) => {
            const target = await fromUuid(token)
            if (!target || !target.isOwner) return

            extraRows.push({
                uuid: token,
                template: await renderTemplate(templatePath('target/row-header'), { name: target.name, uuid: token }),
            })
        })
    )

    if (!extraRows.length) return

    const template = $('<div class="target-helper"></div>')

    extraRows.forEach(row => {
        template.append('<hr>')
        template.append(row.template)

        const clone = damageRow.clone()

        clone.each((index, el) => {
            el.dataset.rollIndex = index
            el.dataset.targetUuid = row.uuid
        })

        template.append(clone)
    })

    msgContent.after(template)

    template.find('button[data-action^=target-]').on('click', event => onTargetButton(event, message))
    template.find('[data-action=ping-target]').on('click', pingTarget)
    template.find('[data-action=open-target-sheet]').on('click', openTargetSheet)
}

async function getTargetFromEvent(event) {
    const { targetUuid } = event.currentTarget.closest('[data-target-uuid]').dataset
    return fromUuid(targetUuid)
}

async function openTargetSheet(event) {
    const target = await getTargetFromEvent(event)
    if (!target) return

    target.actor?.sheet.render(true)
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
