import { getFlag, setFlag, updateSourceFlag } from '../shared/flags'
import { createHook } from '../shared/hook'
import { localize, subLocalize } from '../shared/localize'
import { templatePath } from '../shared/path'
import { applyDamageFromMessage, onClickShieldBlock } from '../shared/pf2e'
import { getSetting } from '../shared/settings'
import { getTemplateTokens } from '../shared/template'

const SAVES = {
    fortitude: { icon: 'fa-solid fa-chess-rook', label: 'PF2E.SavesFortitude' },
    reflex: { icon: 'fa-solid fa-person-running', label: 'PF2E.SavesReflex' },
    will: { icon: 'fa-solid fa-brain', label: 'PF2E.SavesWill' },
}

const DEGREE_OF_SUCCESS = ['criticalFailure', 'failure', 'success', 'criticalSuccess']

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
}

async function createMeasuredTemplate(template, _, userId) {
    const user = game.user
    if (user.id !== userId) return
    //  token.setTarget(!targeted, { releaseOthers: !event.shiftKey })

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
    if (!message.isDamageRoll) return

    const targets = game.user.targets
    if (targets.size < 1) return

    updateSourceFlag(
        message,
        'target.targets',
        Array.from(targets.map(target => ({ token: target.document.uuid, actor: target.actor.uuid })))
    )

    const item = message.item
    if (item?.type !== 'spell') return

    const statistic = item.system.defense?.save.statistic
    if (!statistic) return

    const spellcasting = item.spellcasting
    if (!spellcasting) return

    updateSourceFlag(message, 'target.save', {
        statistic,
        dc: spellcasting.statistic.dc.value,
    })
}

async function renderChatMessage(message, html) {
    const targetsFlag = getFlag(message, 'target.targets') ?? []
    if (!targetsFlag.length) return

    const save = (() => {
        const flag = getFlag(message, 'target.save')
        if (!flag) return
        return {
            ...flag,
            ...SAVES[flag.statistic],
        }
    })()

    const targets = (
        await Promise.all(
            targetsFlag.map(async ({ token }) => {
                const target = await fromUuid(token)
                if (!target?.isOwner) return

                return {
                    uuid: token,
                    target: target,
                    template: await renderTemplate(templatePath('target/row-header'), {
                        name: target.name,
                        uuid: token,
                        save: save && {
                            ...save,
                            result: getFlag(message, `target.saves.${target.id}`),
                        },
                    }),
                }
            })
        )
    ).filter(Boolean)
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

    const rowsTemplate = $('<div class="pf2e-toolbelt-target-helper"></div>')

    targets.forEach(({ uuid, template }) => {
        rowsTemplate.append('<hr>')

        rowsTemplate.append(template)

        const clone = damageRow.clone()

        clone.each((index, el) => {
            el.dataset.rollIndex = index
            el.dataset.targetUuid = uuid
        })

        rowsTemplate.append(clone)
    })

    msgContent.after(rowsTemplate)

    rowsTemplate.find('button[data-action^=target-]').on('click', event => onTargetButton(event, message))
    rowsTemplate.find('[data-action=ping-target]').on('click', pingTarget)
    rowsTemplate.find('[data-action=open-target-sheet]').on('click', openTargetSheet)
    rowsTemplate.find('[data-action=roll-save]').on('click', event => rollSave(event, message, save))

    if (targets.length <= 1) return

    const selectTooltip = localize('target.chat.select.tooltip')
    const selectButton = $(`<button class="pf2e-toolbelt-target-select" 
        data-action="target-select" title="${selectTooltip}">
    <i class="fa-solid fa-street-view"></i>
</button>`)

    selectButton.on('click', event => selectTargets(event, targets))

    html.find('.dice-result .dice-total').append(selectButton)
}

async function getTargetFromEvent(event) {
    const { targetUuid } = event.currentTarget.closest('[data-target-uuid]').dataset
    return fromUuid(targetUuid)
}

async function rollSave(event, message, { dc, statistic }) {
    const target = await getTargetFromEvent(event)
    const actor = target?.actor
    if (!actor) return

    const skipDefault = !game.user.settings.showCheckDialogs
    const options = {
        dc: { value: dc },
        skipDialog: event.shiftKey ? !skipDefault : skipDefault,
    }

    if (!getSetting('target-save')) options.createMessage = false

    const roll = await actor.saves[statistic].roll(options)

    setFlag(message, `target.saves.${target.id}`, {
        value: roll.total,
        success: DEGREE_OF_SUCCESS[roll.degreeOfSuccess],
    })
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
