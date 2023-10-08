import { MODULE_ID, getSetting, localeCompare, templatePath } from '../module'
import { createChoicesHook } from './shared/hook'

const setHook = createChoicesHook('renderCharacterSheetPF2e', renderCharacterSheetPF2e, refreshSheets)

export function registerSpellsSummary() {
    return {
        settings: [
            {
                name: 'summary',
                type: String,
                default: 'disabled',
                scope: 'client',
                choices: ['disabled', 'enabled', 'sort'],
                onChange: setHook,
            },
        ],
        conflicts: ['pf2e-spells-summary'],
        init: isGm => {
            if (getSetting('summary')) setHook(true)
        },
    }
}

function refreshSheets() {
    Object.values(ui.windows).forEach(win => win instanceof ActorSheet && win.actor.type === 'character' && win.render())
}

async function renderCharacterSheetPF2e(sheet, html) {
    const actor = sheet.actor
    if (!actor || actor.pack || !actor.id || !actor.isOfType('character')) return

    const tab = getSpellcastingTab(html)

    if (getProperty(sheet, `modules.${MODULE_ID}.toggled`)) tab.addClass('toggled')

    getSpellcastingNav(html).on('click', event => onSpellcastingBtnToggle(event, html, sheet))
    await addSummaryTab(html, sheet, actor)

    if (tab.hasClass('toggled') && tab.hasClass('active')) {
        sheet._restoreScrollPositions(html)
    }
}

async function addSummaryTab(html, sheet, actor) {
    const tab = getSpellcastingTab(html)
    const data = await getData(actor)

    const template = await renderTemplate(templatePath('summary/sheet'), data)

    tab.append(template)
    addSummaryEvents(html, sheet, actor)
}

function addSummaryEvents(html, sheet, actor) {
    const summary = getSpellcastingSummarySection(html)

    const inputs = summary.find('.spell-type .uses .spell-slots-input input')
    inputs.on('change', event => onUsesInputChange(event, actor))
    inputs.on('focus', onUsesInputFocus)
    inputs.on('blur', onUsesInputBlur)

    summary.find('.cast-spell').on('click', event => onCastSpell(event, actor))
    summary.find('.item-toggle-prepare').on('click', event => onTogglePrepare(event, actor))
    summary.find('.focus-pips').on('click contextmenu', event => onToggleFocusPool(event, actor))
    summary.find('.spell-slots-increment-reset').on('click', event => onSlotsReset(event, sheet, actor))
    summary.find('.item-image').on('click', event => onItemToChat(event, actor))
    summary.find('.item-name > h4').on('click', event => onToggleSummary(event, sheet))
}

async function onUsesInputChange(event, actor) {
    event.preventDefault()

    const { inputPath, entryId } = $(event.currentTarget).data()
    const value = event.currentTarget.valueAsNumber
    actor.updateEmbeddedDocuments('Item', [{ _id: entryId, [inputPath]: value }])
}

function onUsesInputFocus(event) {
    event.preventDefault()
    event.currentTarget.closest('.item')?.classList.add('hover')
}

function onUsesInputBlur(event) {
    event.preventDefault()
    event.currentTarget.closest('.item')?.classList.remove('hover')
}

function onTogglePrepare(event, actor) {
    event.preventDefault()
    const { slotLevel, slotId, entryId, expended } = $(event.currentTarget).closest('.item').data()
    const collection = actor.spellcasting.collections.get(entryId)
    collection?.setSlotExpendedState(slotLevel ?? 0, slotId ?? 0, expended !== true)
}

function onToggleFocusPool(event, actor) {
    event.preventDefault()
    const change = event.type === 'click' ? 1 : -1
    const points = (actor.system.resources.focus?.value ?? 0) + change
    actor.update({ 'system.resources.focus.value': points })
}

function onChargeReset(sheet, entryId) {
    const original = getSpellcastingOriginalSection(sheet.element)
    const entry = original.find(`.item-container.spellcasting-entry[data-item-id=${entryId}]`)
    const btn = entry.find('.spell-ability-data .statistic-values a.pf2e-staves-charge')
    btn[0]?.click()
}

function onSlotsReset(event, sheet, actor) {
    event.preventDefault()

    const { itemId, level, isCharge } = $(event.currentTarget).data()
    if (!itemId) return

    if (isCharge) {
        onChargeReset(sheet, itemId)
        return
    }

    const item = actor.items.get(itemId)
    if (!item) return

    if (item.isOfType('spellcastingEntry')) {
        const slotLevel = level >= 0 && level <= 11 ? `slot${level}` : 'slot0'
        const slot = item.system.slots?.[slotLevel]
        if (slot) item.update({ [`system.slots.${slotLevel}.value`]: slot.max })
    } else if (item.isOfType('spell')) {
        const max = item.system.location.uses?.max
        if (max) item.update({ 'system.location.uses.value': max })
    }
}

function onCastSpell(event, actor) {
    event.preventDefault()

    const target = $(event.currentTarget)
    if (target.prop('disabled')) return

    const { itemId, slotLevel, slotId, entryId } = target.closest('.item').data()
    const collection = actor.spellcasting.collections.get(entryId)
    if (!collection) return

    const spell = collection.get(itemId)
    if (!spell) return

    collection.entry.cast(spell, { slot: slotId, level: slotLevel })
}

async function onToggleSummary(event, sheet) {
    const item = event.currentTarget.closest('.item')
    await sheet.itemRenderer.toggleSummary(item)
}

async function onItemToChat(event, actor) {
    const itemId = $(event.currentTarget).closest('.item').attr('data-item-id')
    const item = actor.items.get(itemId)
    if (!item || (item.isOfType('physical') && !item.isIdentified)) return
    await item.toMessage(event)
}

function onSpellcastingBtnToggle(event, html, sheet) {
    event.preventDefault()

    const tab = getSpellcastingTab(html)

    if (tab.hasClass('active')) {
        tab.toggleClass('toggled')
        tab.scrollTop(0)
        setProperty(sheet, `modules.${MODULE_ID}.toggled`, tab.hasClass('toggled'))
    }
}

function getSpellcastingNav(html) {
    return html.find('nav.sheet-navigation .item[data-tab=spellcasting]')
}

function getSpellcastingTab(html) {
    return html.find('section.sheet-body .sheet-content > .tab[data-tab=spellcasting]')
}

function getSpellcastingOriginalSection(html) {
    return getSpellcastingTab(html).find('.directory-list.spellcastingEntry-list')
}

function getSpellcastingSummarySection(html) {
    return getSpellcastingTab(html).find('.directory-list.summary')
}

async function getData(actor) {
    const focusPool = actor.system.resources.focus ?? { value: 0, max: 0 }
    const stavesActive = game.modules.get('pf2e-staves')?.active
    const spells = []
    const focuses = []

    let hasFocusCantrips = false

    await Promise.all(
        actor.spellcasting.regular.map(async entry => {
            const entryId = entry.id
            const entryDc = entry.statistic.dc.value
            const entryName = entry.name
            const data = await entry.getSheetData()
            const isFocus = data.isFocusPool
            const isCharge = entry.system?.prepared?.value === 'charge'
            const isStaff = getProperty(entry, 'flags.pf2e-staves.staveID') !== undefined
            const charges = { value: getProperty(entry, 'flags.pf2e-staves.charges') ?? 0 }

            for (const slot of data.levels) {
                if (!slot.active.length || slot.uses?.max === 0) continue

                const slotSpells = []
                const isCantrip = slot.isCantrip
                const actives = slot.active.filter(x => x && x.uses?.max !== 0)
                const isBroken = !isCantrip && isCharge && !stavesActive

                for (let slotId = 0; slotId < actives.length; slotId++) {
                    const { spell, expended, virtual, uses, castLevel } = actives[slotId]

                    slotSpells.push({
                        name: spell.name,
                        img: spell.img,
                        range: spell.system.range.value || '-',
                        castLevel: castLevel ?? spell.level,
                        slotId,
                        entryId,
                        entryDc,
                        entryName,
                        itemId: spell.id,
                        inputId: data.isInnate ? spell.id : data.id,
                        inputPath: isCharge
                            ? 'flags.pf2e-staves.charges'
                            : data.isInnate
                            ? 'system.location.uses.value'
                            : `system.slots.slot${slot.level}.value`,
                        isCharge,
                        isActiveCharge: isCharge && stavesActive,
                        isBroken,
                        isVirtual: virtual,
                        isInnate: data.isInnate,
                        isCantrip: isCantrip,
                        isFocus,
                        isPrepared: data.isPrepared,
                        isSpontaneous: data.isSpontaneous || data.isFlexible,
                        slotLevel: slot.level,
                        uses: uses ?? (isCharge ? charges : slot.uses),
                        expended: expended ?? (isFocus && !isCantrip ? focusPool.value <= 0 : false),
                        action: spell.system.time.value,
                        type: isCharge
                            ? isStaff
                                ? `${MODULE_ID}.summary.staff`
                                : `${MODULE_ID}.summary.charges`
                            : data.isInnate
                            ? 'PF2E.PreparationTypeInnate'
                            : data.isSpontaneous
                            ? 'PF2E.PreparationTypeSpontaneous'
                            : data.isFlexible
                            ? 'PF2E.SpellFlexibleLabel'
                            : isFocus
                            ? 'PF2E.SpellFocusLabel'
                            : 'PF2E.SpellPreparedLabel',
                        order: isCharge ? 0 : data.isPrepared ? 1 : isFocus ? 2 : data.isInnate ? 3 : data.isSpontaneous ? 4 : 5,
                        noHover: data.isPrepared || isCantrip || isBroken || isFocus,
                    })
                }

                if (slotSpells.length) {
                    if (isFocus) {
                        if (isCantrip) hasFocusCantrips = true
                        else {
                            focuses.push(...slotSpells)
                            continue
                        }
                    }

                    spells[slot.level] ??= []
                    spells[slot.level].push(...slotSpells)
                }
            }
        })
    )

    if (spells.length) {
        const sort =
            getSetting('summary') === 'sort'
                ? (a, b) => (a.order === b.order ? localeCompare(a.name, b.name) : a.order - b.order)
                : (a, b) => localeCompare(a.name, b.name)
        spells.forEach(entry => entry.sort(sort))
    }

    if (focuses.length) {
        focuses.sort((a, b) => localeCompare(a.name, b.name))
        spells[12] = focuses
        hasFocusCantrips = false
    }

    const ritualData = await actor.spellcasting.ritual?.getSheetData()
    const rituals = ritualData?.levels.flatMap((slot, slotId) =>
        slot.active
            .map(({ spell }) => ({
                name: spell.name,
                img: spell.img,
                slotId,
                itemId: spell.id,
                level: spell.level,
                time: spell.system.time.value,
            }))
            .filter(Boolean)
    )

    return {
        spells,
        rituals,
        focusPool,
        stavesActive,
        hasFocusCantrips,
        isOwner: actor.isOwner,
    }
}
