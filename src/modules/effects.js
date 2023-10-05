import { getSetting, localize } from '../module'

export function registerEffectsPanelHelper() {
    return {
        settings: [
            {
                name: 'effect-remove',
                type: Boolean,
                default: false,
                scope: 'client',
                onChange: refreshEffectsPanel,
            },
            {
                name: 'condition-sheet',
                type: Boolean,
                default: false,
                scope: 'client',
                onChange: refreshEffectsPanel,
            },
        ],
        conflicts: ['pf2e-effect-description'],
        init: () => {
            Hooks.on('renderEffectsPanel', renderEffectsPanel)
        },
    }
}

function refreshEffectsPanel() {
    game.pf2e.effectPanel?.render()
}

function renderEffectsPanel(panel, html) {
    const effectRemove = getSetting('effect-remove')
    const conditionSheet = getSetting('condition-sheet')
    if (!effectRemove && !conditionSheet) return

    const removeRow = `<div>${localize('effects.remove')}</div>`
    const editIcon = `<a data-action="edit" data-tooltip="Edit Item"><i class="fa-solid fa-fw fa-pencil"></i></a>`

    const effectPanels = html.find('.effect-item[data-item-id]').toArray()
    for (const effectPanel of effectPanels) {
        const id = effectPanel.dataset.itemId
        const effect = panel.actor?.items.get(id)
        if (!effect) continue

        if (effectRemove && !effect.isLocked && effect.badge && effect.badge.type === 'counter') {
            effectPanel.querySelector('.effect-info .instructions').insertAdjacentHTML('beforeend', removeRow)
            effectPanel.querySelector('.icon').addEventListener('contextmenu', event => onRemoveEffect(event, panel), true)
        }

        if (conditionSheet && effect.isOfType('condition')) {
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
