import { registerWrapper } from '../shared/libwrapper'
import { info } from '../shared/notification'
import { getSetting } from '../shared/settings'

const PREPARE_WEAPON_DATA = 'CONFIG.PF2E.Item.documentClasses.weapon.prototype.prepareBaseData'
const PREPARE_WEAPON_DERIVED_DATA = 'CONFIG.PF2E.Item.documentClasses.weapon.prototype.prepareDerivedData'

const PREPARE_SHIELD_DATA = 'CONFIG.PF2E.Item.documentClasses.shield.prototype.prepareBaseData'
const PREPARE_SHIELD_DERIVED_DATA = 'CONFIG.PF2E.Item.documentClasses.shield.prototype.prepareDerivedData'

const PREPARE_ARMOR_DATA = 'CONFIG.PF2E.Item.documentClasses.armor.prototype.prepareBaseData'
const PREPARE_ARMOR_DERIVED_DATA = 'CONFIG.PF2E.Item.documentClasses.armor.prototype.prepareDerivedData'

const HANDWRAPS_SLUG = 'handwraps-of-mighty-blows'

export function registerArp() {
    return {
        settings: [
            {
                name: 'arp',
                type: Boolean,
                default: false,
                requiresReload: true,
            },
        ],
        conflicts: ['pf2e-arp'],
        init: () => {
            const setting = getSetting('arp')
            if (!setting) return

            registerWrapper(PREPARE_WEAPON_DATA, onPrepareWeaponData, 'WRAPPER')
            registerWrapper(PREPARE_WEAPON_DERIVED_DATA, onPrepareWeaponDerivedData, 'WRAPPER')

            registerWrapper(PREPARE_ARMOR_DATA, onPrepareArmorData, 'WRAPPER')
            registerWrapper(PREPARE_ARMOR_DERIVED_DATA, onPrepareArmorDerivedData, 'WRAPPER')

            // if (setting === 'with-shield') {
            //     registerWrapper(PREPARE_SHIELD_DATA, onPrepareShieldData, 'WRAPPER')
            //     registerWrapper(PREPARE_SHIELD_DERIVED_DATA, onPrepareShieldDerivedData, 'WRAPPER')
            // }
        },
        ready: isGM => {
            if (isGM && getSetting('arp') && game.settings.get('pf2e', 'automaticBonusVariant') !== 'noABP') {
                game.settings.set('pf2e', 'automaticBonusVariant', 'noABP')
                info('arp.forceVariant')
            }
        },
    }
}

function isValidActor(actor, isCharacter = false) {
    return actor && !actor.getFlag('pf2e', 'disableABP') && (!isCharacter || actor.isOfType('character'))
}

/**
 * weapon
 */

const WEAPON_POTENCY_PRICE = {
    1: 35,
    2: 935,
    3: 8935,
    4: 8935,
}

const WEAPON_STRIKING_PRICE = {
    1: 65,
    2: 1065,
    3: 31065,
}

function isValidWeapon(weapon) {
    const traits = weapon._source.system.traits.value
    const group = weapon._source.system.group
    const category = weapon._source.system.category
    const slug = weapon._source.system.slug

    if (category === 'unarmed' && slug !== HANDWRAPS_SLUG) {
        return !!weapon.actor.itemTypes.weapon.find(
            weapon => weapon.slug === HANDWRAPS_SLUG && weapon.category === 'unarmed' && weapon.isEquipped && weapon.isInvested
        )
    }

    return group !== 'shield' && !traits.includes('alchemical') && !traits.includes('bomb')
}

function onPrepareWeaponData(wrapped) {
    const actor = this.actor
    if (!isValidActor(actor, true) || !isValidWeapon(this)) return wrapped()

    const level = actor.level

    const traits = this._source.system.traits.value
    if (traits.includes('alchemical') && traits.includes('bomb')) return wrapped()

    this.system.runes.potency = level < 2 ? null : level < 10 ? 1 : level < 16 ? 2 : 3
    this.system.runes.striking = level < 4 ? null : level < 12 ? 1 : level < 19 ? 2 : 3

    wrapped()
}

function onPrepareWeaponDerivedData(wrapped) {
    wrapped()

    if (!isValidActor(this.actor) || this.isSpecific || !isValidWeapon(this)) return

    let coins = this.price.value.toObject()
    if (!coins.gp) return

    const potency = this.system.runes.potency
    if (potency) coins.gp -= WEAPON_POTENCY_PRICE[potency]

    const striking = this.system.runes.striking
    if (striking) coins.gp -= WEAPON_STRIKING_PRICE[striking]

    coins = new game.pf2e.Coins(coins)

    if ((potency || striking) && !this.system.runes.property.length) {
        coins = coins.add(this._source.system.price.value)
    }

    this.system.price.value = coins
}

/**
 * shield
 */

const SHIELD_REINFORCING = {
    1: { price: 75, increase: 44 }, // level 4
    2: { price: 300, increase: 52 }, // level 7
    3: { price: 900, increase: 64 }, // level 10
    4: { price: 2500, increase: 80 }, // level 13
    5: { price: 8000, increase: 84 }, // level 16
    6: { price: 32000, increase: 108 }, // level 19
}

function isValidShield(shield) {
    return true
}

function onPrepareShieldData(wrapped) {
    const actor = this.actor
    if (!isValidActor(actor, true) || !isValidShield(this)) return wrapped()

    const level = actor.level

    this.system.runes.reinforcing =
        level < 4 ? null : level < 7 ? 1 : level < 10 ? 2 : level < 13 ? 3 : level < 16 ? 4 : level < 19 ? 5 : 6

    wrapped()
}

function onPrepareShieldDerivedData(wrapped) {
    wrapped()

    if (!isValidActor(this.actor) || this.isSpecific || !isValidShield(this)) return

    let coins = this.price.value.toObject()
    if (!coins.gp) return

    const reinforcing = this.system.runes.reinforcing
    if (reinforcing) coins.gp -= SHIELD_REINFORCING[reinforcing].price

    coins = new game.pf2e.Coins(coins)

    this.system.price.value = coins
}

/**
 * amor
 */

const ARMOR_POTENCY_PRICE = {
    1: 160,
    2: 1060,
    3: 20560,
    4: 20560,
}

const ARMOR_RESILIENCY_PRICE = {
    1: 340,
    2: 3440,
    3: 49440,
}

function isValidArmor(armor) {
    return true
}

function onPrepareArmorData(wrapped) {
    const actor = this.actor
    if (!isValidActor(actor, true) || !isValidArmor(this)) return wrapped()

    const level = actor.level

    this.system.runes.potency = level < 5 ? null : level < 11 ? 1 : level < 18 ? 2 : 3
    this.system.runes.resilient = level < 8 ? null : level < 14 ? 1 : level < 20 ? 2 : 3

    wrapped()
}

function onPrepareArmorDerivedData(wrapped) {
    wrapped()

    if (!isValidActor(this.actor) || this.isSpecific || !isValidArmor(this)) return

    let coins = this.price.value.toObject()
    if (!coins.gp) return

    const potency = this.system.runes.potency
    if (potency) coins.gp -= ARMOR_POTENCY_PRICE[potency]

    const resiliency = this.system.runes.resilient
    if (resiliency) coins.gp -= ARMOR_RESILIENCY_PRICE[resiliency]

    coins = new game.pf2e.Coins(coins)

    if ((potency || resiliency) && !this.system.runes.property.length) {
        coins = coins.add(this._source.system.price.value)
    }

    this.system.price.value = coins
}
