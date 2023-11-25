import { bindOnPreCreateSpellDamageChatMessage } from '../shared/chat'
import { getFlag, setFlag, updateSourceFlag } from '../shared/flags'
import { createHook } from '../shared/hook'
import { localize, subLocalize } from '../shared/localize'
import { templatePath } from '../shared/path'
import { applyDamageFromMessage, onClickShieldBlock } from '../shared/pf2e'
import { getSetting } from '../shared/settings'
import { socketEmit, socketOff, socketOn } from '../shared/socket'
import { getTemplateTokens } from '../shared/template'
import { isActiveGM, isUserGM } from '../shared/user'

const SAVES = {
    fortitude: { icon: 'fa-solid fa-chess-rook', label: 'PF2E.SavesFortitude' },
    reflex: { icon: 'fa-solid fa-person-running', label: 'PF2E.SavesReflex' },
    will: { icon: 'fa-solid fa-brain', label: 'PF2E.SavesWill' },
}

const DEGREE_OF_SUCCESS = ['criticalFailure', 'failure', 'success', 'criticalSuccess']

const setPrecreateMessageHook = createHook('preCreateChatMessage', preCreateChatMessage)
const setRenderMessageHook = createHook('renderChatMessage', renderChatMessage)
const setCreateTemplateHook = createHook('createMeasuredTemplate', createMeasuredTemplate)

let SOCKET = false

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
                name: 'target-save',
                type: Boolean,
                default: true,
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

    if (isUserGM()) {
        if (value && !SOCKET) {
            socketOn(onSocket)
            SOCKET = true
        } else if (!value && SOCKET) {
            socketOff(onSocket)
            SOCKET = false
        }
    }
}

function onSocket(packet) {
    if (!isActiveGM()) return
    switch (packet.type) {
        case 'target.update-save':
            updateMessageSave(packet)
            break
    }
}

async function createMeasuredTemplate(template, _, userId) {
    const user = game.user
    if (user.id !== userId) return

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

    const alliance = actor ? actor.alliance : user.isGM ? 'opposition' : 'party'
    const opposition = alliance === 'party' ? 'opposition' : alliance === 'opposition' ? 'party' : null

    const targets = getTemplateTokens(template).filter(token => {
        if (self && token === self) return result.self

        const targetAlliance = token.actor ? token.actor.alliance : token.alliance

        if (targetAlliance === null) return result.neutral

        return (
            result.targets === 'all' ||
            (result.targets === 'allies' && targetAlliance === alliance) ||
            (result.targets === 'enemies' && targetAlliance === opposition)
        )
    })

    const targetsIds = targets.map(token => token.id)
    user.updateTokenTargets(targetsIds)
    user.broadcastActivity({ targets: targetsIds })
}

function preCreateChatMessage(message) {
    if (message.isDamageRoll) {
        const targets = game.user.targets
        if (targets.size < 1) return

        updateSourceFlag(
            message,
            'target.targets',
            Array.from(targets.map(target => ({ token: target.document.uuid, actor: target.actor.uuid })))
        )
    }

    const item = message.item
    if (item?.type !== 'spell') return

    const save = item.system.defense?.save
    if (!save) return

    const dc = (() => {
        if (!item.trickMagicEntry) return item.spellcasting?.statistic.dc.value
        return $(message.content).find('[data-action=spell-save]').data()?.dc
    })()
    if (typeof dc !== 'number') return

    updateSourceFlag(message, 'target.save', {
        ...save,
        dc,
    })
}

async function renderChatMessage(message, html) {
    if (message.isDamageRoll) {
        await renderDamageChatMessage(message, html)
        scrollToBottom(message)
        return
    }

    const item = message.item
    if (!item || item.type !== 'spell') return

    if (!item.damageKinds.size) {
        await renderSpellChatMessage(message, html, item)
        scrollToBottom(message)
    } else if (item.trickMagicEntry && item.system.defense?.save) {
        html.find('[data-action=spell-damage]').on('click', () => {
            bindOnPreCreateSpellDamageChatMessage(message)
        })
    }
}

function scrollToBottom(message) {
    const chat = ui.chat
    if (chat.isAtBottom || message.user._id === game.user._id) chat.scrollBottom({ waitImages: true })
}

async function renderSpellChatMessage(message, html, spell) {
    const data = await getMessageData(message)
    if (!data) return

    const { targets, save } = data
    const msgContent = html.find('.message-content')
    const cardBtns = msgContent.find('.card-buttons')

    if (game.user.isGM || message.isAuthor) {
        const saveBtn = cardBtns.find('[data-action=spell-save]')
        const wrapper = $('<div class="pf2e-toolbelt-target-wrapper"></div>')
        const targetsTooltip = localize('target.chat.targets.tooltip')

        const targetsBtn = $(`<button class="pf2e-toolbelt-target-targets" title="${targetsTooltip}">
        <i class="fa-solid fa-bullseye-arrow"></i>
        </button>`)

        targetsBtn.on('click', event => addTargets(event, message))

        wrapper.append(targetsBtn)
        wrapper.append(saveBtn)
        cardBtns.prepend(wrapper)
    }

    if (spell && spell.area && !spell.traits.has('aura')) {
        const template = canvas.scene?.templates.some(template => template.message === message && template.isOwner)
        if (template) cardBtns.find('.owner-buttons .hidden.small').removeClass('hidden')
    }

    if (!targets.length) return

    const rowsTemplate = $('<div class="pf2e-toolbelt-target-spell"></div>')

    targets.forEach(({ template }) => {
        rowsTemplate.append('<hr>')
        rowsTemplate.append(template)
    })

    msgContent.after(rowsTemplate)

    addHeaderListeners(message, rowsTemplate, save)
}

function addTargets(event, message) {
    const targets = game.user.targets

    setFlag(
        message,
        'target.targets',
        Array.from(targets.map(target => ({ token: target.document.uuid, actor: target.actor.uuid })))
    )
}

async function renderDamageChatMessage(message, html) {
    const data = await getMessageData(message)
    if (!data || !data.targets.length) return

    const { targets, save } = data
    const msgContent = html.find('.message-content')
    const damageRow = msgContent.find('.damage-application').clone()
    if (!damageRow.length) return

    damageRow.removeClass('damage-application').addClass('target-damage-application')
    damageRow.find('button > *:not(.label)').remove()
    damageRow.find('[data-action]').each(function () {
        const action = this.dataset.action
        this.dataset.action = `target-${action}`
    })

    const rowsTemplate = $('<div class="pf2e-toolbelt-target-damage"></div>')

    targets.forEach(({ uuid, template, save }) => {
        rowsTemplate.append('<hr>')

        rowsTemplate.append(template)

        const clone = damageRow.clone()

        clone.each((index, el) => {
            el.dataset.rollIndex = index
            el.dataset.targetUuid = uuid
            if (save && save.result && save.basic) el.classList.add(save.result.success)
        })

        rowsTemplate.append(clone)
    })

    msgContent.after(rowsTemplate)

    addHeaderListeners(message, rowsTemplate, save)
    rowsTemplate.find('button[data-action^=target-]').on('click', event => onTargetButton(event, message))

    if (targets.length <= 1) return

    const selectTooltip = localize('target.chat.select.tooltip')
    const selectBtn = $(`<button class="pf2e-toolbelt-target-select" title="${selectTooltip}">
    <i class="fa-solid fa-street-view"></i>
</button>`)

    selectBtn.on('click', event => selectTargets(event, targets))

    html.find('.dice-result .dice-total').append(selectBtn)
}

function addHeaderListeners(message, html, save) {
    html.find('[data-action=ping-target]').on('click', pingTarget)
    html.find('[data-action=open-target-sheet]').on('click', openTargetSheet)
    html.find('[data-action=roll-save]').on('click', event => rollSave(event, message, save))
}

async function getMessageData(message) {
    const targetsFlag = getFlag(message, 'target.targets') ?? []

    const save = (() => {
        const flag = getFlag(message, 'target.save')
        if (!flag) return
        return {
            ...flag,
            ...SAVES[flag.statistic],
        }
    })()

    if (!targetsFlag.length && !save) return

    const targets = (
        await Promise.all(
            targetsFlag.map(async ({ token }) => {
                const target = await fromUuid(token)
                if (!target?.isOwner) return

                const targetSave = save && {
                    ...save,
                    result: getFlag(message, `target.saves.${target.id}`),
                }

                return {
                    uuid: token,
                    target: target,
                    save: targetSave,
                    template: await renderTemplate(templatePath('target/row-header'), {
                        name: target.name,
                        uuid: token,
                        save: targetSave,
                    }),
                }
            })
        )
    ).filter(Boolean)

    return { targets, save }
}

async function getTargetFromEvent(event) {
    const { targetUuid } = event.currentTarget.closest('[data-target-uuid]').dataset
    return fromUuid(targetUuid)
}

async function rollSave(event, message, { dc, statistic }) {
    const target = await getTargetFromEvent(event)

    const item = (() => {
        const item = message.item
        if (item) return item

        const messageId = getFlag(message, 'target.messageId')
        if (!messageId) return

        const otherMessage = game.messages.get(messageId)
        if (!otherMessage) return

        return otherMessage.item
    })()

    const actor = target?.actor
    if (!actor) return

    const save = actor.saves[statistic]
    if (!save) return

    const skipDefault = !game.user.settings.showCheckDialogs
    const options = {
        dc: { value: dc },
        item,
        origin: actor,
        skipDialog: event.shiftKey ? !skipDefault : skipDefault,
    }

    if (!getSetting('target-save')) options.createMessage = false

    const roll = await save.check.roll(options)

    const packet = {
        type: 'target.update-save',
        target: target.id,
        value: roll.total,
        die: roll.dice[0].total,
        success: roll.degreeOfSuccess,
    }

    if (game.user.isGM || message.isAuthor) {
        packet.message = message
        updateMessageSave(packet)
    } else {
        packet.message = message.id
        socketEmit(packet)
    }
}

function updateMessageSave({ message, target, value, success, die }) {
    if (typeof message === 'string') {
        message = game.messages.get(message)
        if (!message) return
    }

    if (typeof success === 'number') success = DEGREE_OF_SUCCESS[success]

    setFlag(message, `target.saves.${target}`, { value, success, die })
}

function selectTargets(event, targets) {
    event.stopPropagation()
    canvas.tokens.releaseAll()
    const options = { releaseOthers: false }
    targets.forEach(({ target }) => target.object.control(options))
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
