import { getSetting, localize } from '../module'
import { createHook } from './shared/hook'

const setHook = createHook('renderEffectsPanel', renderEffectsPanel, refreshEffectsPanel)

export function registerEffectsPanelHelper() {
    return {
        settings: [
            {
                name: 'effect-remove',
                type: Boolean,
                default: false,
                scope: 'client',
                onChange: value => setHook(value, 'condition-sheet'),
            },
            {
                name: 'condition-sheet',
                type: Boolean,
                default: false,
                scope: 'client',
                onChange: value => setHook(value, 'effect-remove'),
            },
        ],
        conflicts: ['pf2e-effect-description'],
        init: () => {
            if (!getSetting('effect-remove') && !getSetting('condition-sheet')) return
            setHook(true)
        },
    }
}

function refreshEffectsPanel() {
    game.pf2e.effectPanel?.render()
}

function renderEffectsPanel(panel, html) {
    const removeRow = `<div>${localize('effects.remove')}</div>`
    const editIcon = `<a data-action="edit" data-tooltip="Edit Item"><i class="fa-solid fa-fw fa-pencil"></i></a>`

    const effectPanels = html.find('.effect-item[data-item-id]').toArray()
    for (const effectPanel of effectPanels) {
        const id = effectPanel.dataset.itemId
        const effect = panel.actor?.items.get(id)
        if (!effect) continue

        if (getSetting('effect-remove') && !effect.isLocked && effect.badge && effect.badge.type === 'counter') {
            effectPanel.querySelector('.effect-info .instructions').insertAdjacentHTML('beforeend', removeRow)
            effectPanel.querySelector('.icon').addEventListener('contextmenu', event => onRemoveEffect(event, panel), true)
        }

        if (getSetting('condition-sheet') && effect.isOfType('condition')) {
            const h1 = effectPanel.querySelector('.effect-info > h1')
            h1.insertAdjacentHTML('beforeend', editIcon)
            h1.querySelector('[data-action="edit"]').addEventListener('click', event => onConditionSheet(event, panel))
        }
    }
}

function onConditionSheet(event, panel) {
    const effect = getEffect(event, panel)
    if (!effect?.isOfType('condition')) return
    event.preventDefault()
    effect.sheet.render(true)
}

function onRemoveEffect(event, panel) {
    if (!event.shiftKey) return

    const effect = getEffect(event, panel)
    if (!effect || effect.isLocked || !effect.badge || effect.badge.type !== 'counter') return

    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()

    effect.delete()
}

function getEffect(event, panel) {
    const target = event.currentTarget
    const effect = target.closest('.effect-item[data-item-id]')
    const id = effect.dataset.itemId
    return panel.actor?.items.get(id)
}
