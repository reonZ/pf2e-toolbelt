import { onDamageApplied } from '../features/target'
import { isInstanceOf } from './misc'

export function ErrorPF2e(message) {
    return Error(`PF2e System | ${message}`)
}

export function setHasElement(set, value) {
    return set.has(value)
}

export function isPhysicalData(source) {
    return setHasElement(PHYSICAL_ITEM_TYPES, source.type)
}

export function hasInvestedProperty(source) {
    return isPhysicalData(source) && 'invested' in source.system.equipped
}

export function localizer(prefix) {
    return (...[suffix, formatArgs]) =>
        formatArgs ? game.i18n.format(`${prefix}.${suffix}`, formatArgs) : game.i18n.localize(`${prefix}.${suffix}`)
}

/**
 * DegreeOfSuccess
 */

const DEGREE_ADJUSTMENT_AMOUNTS = {
    LOWER_BY_TWO: -2,
    LOWER: -1,
    INCREASE: 1,
    INCREASE_BY_TWO: 2,
    TO_CRITICAL_FAILURE: 'criticalFailure',
    TO_FAILURE: 'failure',
    TO_SUCCESS: 'success',
    TO_CRITICAL_SUCCESS: 'criticalSuccess',
}

const DEGREE_OF_SUCCESS_STRINGS = ['criticalFailure', 'failure', 'success', 'criticalSuccess']

export class DegreeOfSuccess {
    constructor(roll, dc, dosAdjustments = null) {
        if (roll instanceof Roll) {
            this.dieResult =
                (roll.isDeterministic
                    ? roll.terms.find(t => t instanceof NumericTerm)
                    : roll.dice.find(d => d instanceof Die && d.faces === 20)
                )?.total ?? 1
            this.rollTotal = roll.total
        } else {
            this.dieResult = roll.dieValue
            this.rollTotal = roll.dieValue + roll.modifier
        }

        this.dc = typeof dc === 'number' ? { value: dc } : dc

        this.unadjusted = this.#calculateDegreeOfSuccess()
        this.adjustment = this.#getDegreeAdjustment(this.unadjusted, dosAdjustments)
        this.value = this.adjustment ? this.#adjustDegreeOfSuccess(this.adjustment.amount, this.unadjusted) : this.unadjusted
    }

    static CRITICAL_FAILURE = 0
    static FAILURE = 1
    static SUCCESS = 2
    static CRITICAL_SUCCESS = 3

    #getDegreeAdjustment(degree, adjustments) {
        if (!adjustments) return null

        for (const outcome of ['all', ...DEGREE_OF_SUCCESS_STRINGS]) {
            const { label, amount } = adjustments[outcome] ?? {}
            if (
                amount &&
                label &&
                !(degree === DegreeOfSuccess.CRITICAL_SUCCESS && amount === DEGREE_ADJUSTMENT_AMOUNTS.INCREASE) &&
                !(degree === DegreeOfSuccess.CRITICAL_FAILURE && amount === DEGREE_ADJUSTMENT_AMOUNTS.LOWER) &&
                (outcome === 'all' || DEGREE_OF_SUCCESS_STRINGS.indexOf(outcome) === degree)
            ) {
                return { label, amount }
            }
        }

        return null
    }

    #adjustDegreeOfSuccess(amount, degreeOfSuccess) {
        switch (amount) {
            case 'criticalFailure':
                return 0
            case 'failure':
                return 1
            case 'success':
                return 2
            case 'criticalSuccess':
                return 3
            default:
                return Math.clamped(degreeOfSuccess + amount, 0, 3)
        }
    }

    /**
     * @param degree The current success value
     * @return The new success value
     */
    #adjustDegreeByDieValue(degree) {
        if (this.dieResult === 20) {
            return this.#adjustDegreeOfSuccess(DEGREE_ADJUSTMENT_AMOUNTS.INCREASE, degree)
        } else if (this.dieResult === 1) {
            return this.#adjustDegreeOfSuccess(DEGREE_ADJUSTMENT_AMOUNTS.LOWER, degree)
        }

        return degree
    }

    #calculateDegreeOfSuccess() {
        const dc = this.dc.value

        if (this.rollTotal - dc >= 10) {
            return this.#adjustDegreeByDieValue(DegreeOfSuccess.CRITICAL_SUCCESS)
        } else if (dc - this.rollTotal >= 10) {
            return this.#adjustDegreeByDieValue(DegreeOfSuccess.CRITICAL_FAILURE)
        } else if (this.rollTotal >= dc) {
            return this.#adjustDegreeByDieValue(DegreeOfSuccess.SUCCESS)
        }

        return this.#adjustDegreeByDieValue(DegreeOfSuccess.FAILURE)
    }
}

/**
 * applyDamageFromMessage
 */

async function extractEphemeralEffects({ affects, origin, target, item, domains, options }) {
    if (!(origin && target)) return []

    const [effectsFrom, effectsTo] = affects === 'target' ? [origin, target] : [target, origin]
    const fullOptions = [...options, effectsFrom.getRollOptions(domains), effectsTo.getSelfRollOptions(affects)].flat()
    const resolvables = item ? (item.isOfType('spell') ? { spell: item } : { weapon: item }) : {}
    return (
        await Promise.all(
            domains
                .flatMap(s => effectsFrom.synthetics.ephemeralEffects[s]?.[affects] ?? [])
                .map(d => d({ test: fullOptions, resolvables }))
        )
    ).flatMap(e => e ?? [])
}

function extractNotes(rollNotes, selectors) {
    return selectors.flatMap(s => (rollNotes[s] ?? []).map(n => n.clone()))
}

function extractDamageDice(deferredDice, selectors, options) {
    return selectors.flatMap(s => deferredDice[s] ?? []).flatMap(d => d(options) ?? [])
}

async function shiftAdjustDamage(token, { message, multiplier, rollIndex }) {
    const content = await renderTemplate('systems/pf2e/templates/chat/damage/adjustment-dialog.hbs')
    const AdjustmentDialog = class extends Dialog {
        activateListeners($html) {
            super.activateListeners($html)
            $html[0].querySelector('input')?.focus()
        }
    }
    new AdjustmentDialog({
        title: game.i18n.localize('PF2E.UI.shiftModifyDamageTitle'),
        content,
        buttons: {
            ok: {
                label: game.i18n.localize('PF2E.OK'),
                callback: async $dialog => {
                    // In case of healing, multipler will have negative sign. The user will expect that positive
                    // modifier would increase healing value, while negative would decrease.
                    const adjustment = (Number($dialog[0].querySelector('input')?.value) || 0) * Math.sign(multiplier)
                    applyDamageFromMessage(token, {
                        message,
                        multiplier,
                        addend: adjustment,
                        promptModifier: false,
                        rollIndex,
                    })
                },
            },
            cancel: {
                label: 'Cancel',
            },
        },
        default: 'ok',
        close: () => {
            toggleOffShieldBlock(message.id)
        },
    }).render(true)
}

export async function applyDamageFromMessage(
    token,
    { message, multiplier = 1, addend = 0, promptModifier = false, rollIndex = 0 }
) {
    if (promptModifier) return shiftAdjustDamage(token, { message, multiplier, rollIndex })

    const shieldBlockRequest = CONFIG.PF2E.chatDamageButtonShieldToggle
    const roll = message.rolls.at(rollIndex)
    if (!isInstanceOf(roll, 'DamageRoll')) throw ErrorPF2e('Unexpected error retrieving damage roll')

    let damage = multiplier < 0 ? multiplier * roll.total + addend : roll.alter(multiplier, addend)

    // Get origin roll options and apply damage to a contextual clone: this may influence condition IWR, for example
    const messageRollOptions = [...(message.flags.pf2e.context?.options ?? [])]
    const originRollOptions = messageRollOptions.filter(o => o.startsWith('self:')).map(o => o.replace(/^self/, 'origin'))
    const messageItem = message.item

    if (!token.actor) return

    // If no target was acquired during a roll, set roll options for it during damage application
    if (!messageRollOptions.some(o => o.startsWith('target'))) {
        messageRollOptions.push(...token.actor.getSelfRollOptions('target'))
    }
    const domain = multiplier > 0 ? 'damage-received' : 'healing-received'
    const ephemeralEffects =
        multiplier > 0
            ? await extractEphemeralEffects({
                  affects: 'target',
                  origin: message.actor,
                  target: token.actor,
                  item: message.item,
                  domains: [domain],
                  options: messageRollOptions,
              })
            : []
    const contextClone = token.actor.getContextualClone(originRollOptions, ephemeralEffects)
    const applicationRollOptions = new Set([
        ...messageRollOptions.filter(o => !/^(?:self|target):/.test(o)),
        ...originRollOptions,
        ...contextClone.getSelfRollOptions(),
    ])

    // Target-specific damage/healing adjustments
    const outcome = message.flags.pf2e.context?.outcome
    const breakdown = []
    const rolls = []
    if (typeof damage === 'number' && damage < 0) {
        const critical = outcome === 'criticalSuccess'

        const resolvables = (() => {
            if (messageItem?.isOfType('spell')) return { spell: messageItem }
            if (messageItem?.isOfType('weapon')) return { weapon: messageItem }
            return {}
        })()

        const damageDice = extractDamageDice(contextClone.synthetics.damageDice, [domain], {
            resolvables,
            test: applicationRollOptions,
        }).filter(d => (d.critical === null || d.critical === critical) && d.predicate.test(applicationRollOptions))

        for (const dice of damageDice) {
            const formula = `${dice.diceNumber}${dice.dieSize}[${dice.label}]`
            const roll = await new Roll(formula).evaluate({ async: true })
            roll._formula = `${dice.diceNumber}${dice.dieSize}` // remove the label from the main formula
            await roll.toMessage({
                flags: { pf2e: { suppressDamageButtons: true } },
                flavor: dice.label,
                speaker: ChatMessage.getSpeaker({ token }),
            })
            breakdown.push(`${dice.label} ${dice.diceNumber}${dice.dieSize}`)
            rolls.push(roll)
        }
        if (rolls.length) {
            damage -= rolls.map(roll => roll.total).reduce((previous, current) => previous + current)
        }

        const modifiers = extractModifiers(contextClone.synthetics, [domain], { resolvables }).filter(
            m => (m.critical === null || m.critical === critical) && m.predicate.test(applicationRollOptions)
        )

        // unlikely to have any typed modifiers, but apply stacking rules just in case even though the context of
        // previously applied modifiers has been lost
        damage -= applyStackingRules(modifiers ?? [])

        // target-specific modifiers breakdown
        breakdown.push(...modifiers.filter(m => m.enabled).map(m => `${m.label} ${signedInteger(m.modifier)}`))
    }

    const hasDamage = typeof damage === 'number' ? damage !== 0 : damage.total !== 0
    const notes = (() => {
        if (!hasDamage) return []
        return extractNotes(contextClone.synthetics.rollNotes, [domain])
            .filter(
                n =>
                    (!outcome || n.outcome.length === 0 || n.outcome.includes(outcome)) &&
                    n.predicate.test(applicationRollOptions)
            )
            .map(note => note.text)
    })()

    await contextClone.applyDamage({
        damage,
        token,
        item: message.item,
        skipIWR: multiplier <= 0,
        rollOptions: applicationRollOptions,
        shieldBlockRequest,
        breakdown,
        notes,
    })

    toggleOffShieldBlock(message.id)

    /**
     * added stuff HERE
     */
    onDamageApplied(message, token.id, rollIndex)
}

function applyStacking(best, modifier, isBetter) {
    // If there is no existing bonus of this type, then add ourselves.
    const existing = best[modifier.type]
    if (existing === undefined) {
        modifier.enabled = true
        best[modifier.type] = modifier
        return modifier.modifier
    }

    if (isBetter(modifier, existing)) {
        // If we are a better modifier according to the comparison, then we become the new 'best'.
        existing.enabled = false
        modifier.enabled = true
        best[modifier.type] = modifier
        return modifier.modifier - existing.modifier
    } else {
        // Otherwise, the existing modifier is better, so do nothing.
        modifier.enabled = false
        return 0
    }
}

function applyStackingRules(modifiers) {
    let total = 0
    const highestBonus = {}
    const lowestPenalty = {}

    // There are no ability bonuses or penalties, so always take the highest ability modifier.
    const abilityModifiers = modifiers.filter(m => m.type === 'ability' && !m.ignored)
    const bestAbility = abilityModifiers.reduce((best, modifier) => {
        if (best === null) {
            return modifier
        } else {
            return modifier.force ? modifier : best.force ? best : modifier.modifier > best.modifier ? modifier : best
        }
    }, null)
    for (const modifier of abilityModifiers) {
        modifier.ignored = modifier !== bestAbility
    }

    for (const modifier of modifiers) {
        // Always disable ignored modifiers and don't do anything further with them.
        if (modifier.ignored) {
            modifier.enabled = false
            continue
        }

        // Untyped modifiers always stack, so enable them and add their modifier.
        if (modifier.type === 'untyped') {
            modifier.enabled = true
            total += modifier.modifier
            continue
        }

        // Otherwise, apply stacking rules to positive modifiers and negative modifiers separately.
        if (modifier.modifier < 0) {
            total += applyStacking(lowestPenalty, modifier, LOWER_PENALTY)
        } else {
            total += applyStacking(highestBonus, modifier, HIGHER_BONUS)
        }
    }

    return total
}

function extractModifierAdjustments(adjustmentsRecord, selectors, slug) {
    const adjustments = Array.from(new Set(selectors.flatMap(s => adjustmentsRecord[s] ?? [])))
    return adjustments.filter(a => [slug, null].includes(a.slug))
}

function extractModifiers(synthetics, selectors, options) {
    const { modifierAdjustments, modifiers: syntheticModifiers } = synthetics
    const modifiers = Array.from(new Set(selectors))
        .flatMap(s => syntheticModifiers[s] ?? [])
        .flatMap(d => d(options) ?? [])
    for (const modifier of modifiers) {
        modifier.adjustments = extractModifierAdjustments(modifierAdjustments, selectors, modifier.slug)
    }

    return modifiers
}

function toggleOffShieldBlock(messageId) {
    for (const app of ['#chat-log', '#chat-popout']) {
        const selector = `${app} > li.chat-message[data-message-id="${messageId}"] button[data-action$=shield-block]`
        $(document).find(selector).removeClass('shield-activated')
    }
    CONFIG.PF2E.chatDamageButtonShieldToggle = false
}

function htmlQuery(parent, selectors) {
    if (!(parent instanceof Element || parent instanceof Document)) return null
    return parent.querySelector(selectors)
}

export function onClickShieldBlock(target, shieldButton, messageEl) {
    const getTokens = () => {
        return [target]
    }

    const getNonBrokenShields = tokens => {
        const actor = tokens[0].actor
        const heldShields = actor.itemTypes.armor.filter(armor => armor.isEquipped && armor.isShield)
        return heldShields.filter(shield => !shield.isBroken)
    }

    // Add a tooltipster instance to the shield button if needed.
    if (!shieldButton.classList.contains('tooltipstered')) {
        $(shieldButton)
            .tooltipster({
                animation: 'fade',
                trigger: 'click',
                arrow: false,
                content: $(messageEl).find('div.hover-content'),
                contentAsHTML: true,
                contentCloning: true,
                debug: false,
                interactive: true,
                side: ['top'],
                theme: 'crb-hover',
                functionBefore: () => {
                    const tokens = getTokens()
                    if (!tokens.length) return false

                    const nonBrokenShields = getNonBrokenShields(tokens)
                    const hasMultipleShields = tokens.length === 1 && nonBrokenShields.length > 1
                    const shieldActivated = shieldButton.classList.contains('shield-activated')

                    // More than one shield and no selection. Show tooltip.
                    if (hasMultipleShields && !shieldActivated) {
                        return true
                    }

                    // More than one shield and one was previously selected. Remove selection and show tooltip.
                    if (hasMultipleShields && shieldButton.dataset.shieldId) {
                        shieldButton.attributes.removeNamedItem('data-shield-id')
                        shieldButton.classList.remove('shield-activated')
                        CONFIG.PF2E.chatDamageButtonShieldToggle = false
                        return true
                    }

                    // Normal toggle behaviour. Tooltip is suppressed.
                    shieldButton.classList.toggle('shield-activated')
                    CONFIG.PF2E.chatDamageButtonShieldToggle = !CONFIG.PF2E.chatDamageButtonShieldToggle
                    return false
                },
                functionFormat: (instance, _helper, $content) => {
                    const tokens = getTokens()
                    const nonBrokenShields = getNonBrokenShields(tokens)
                    const multipleShields = tokens.length === 1 && nonBrokenShields.length > 1
                    const shieldActivated = shieldButton.classList.contains('shield-activated')

                    // If the actor is wielding more than one shield, have the user pick which shield to use for blocking.
                    if (multipleShields && !shieldActivated) {
                        const content = $content[0]
                        // Populate the list with the shield options
                        const listEl = htmlQuery(content, 'ul.shield-options')
                        if (!listEl) return $content
                        const shieldList = []
                        for (const shield of nonBrokenShields) {
                            const input = document.createElement('input')
                            input.classList.add('data')
                            input.type = 'radio'
                            input.name = 'shield-id'
                            input.value = shield.id
                            input.addEventListener('click', () => {
                                shieldButton.dataset.shieldId = input.value
                                shieldButton.classList.add('shield-activated')
                                CONFIG.PF2E.chatDamageButtonShieldToggle = true
                                instance.close()
                            })
                            const shieldName = document.createElement('span')
                            shieldName.classList.add('label')
                            shieldName.innerHTML = shield.name

                            const hardness = document.createElement('span')
                            hardness.classList.add('tag')
                            const hardnessLabel = game.i18n.localize('PF2E.HardnessLabel')
                            hardness.innerHTML = `${hardnessLabel}: ${shield.hardness}`
                            const itemLi = document.createElement('li')
                            itemLi.classList.add('item')
                            itemLi.append(input, shieldName, hardness)
                            shieldList.push(itemLi)
                        }
                        listEl.replaceChildren(...shieldList)
                    }
                    return $content
                },
            })
            .tooltipster('open')
    }
}
