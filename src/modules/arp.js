import { getSetting, info, registerWrapper } from '../module'

const PREPARE_WEAPON_DATA = 'CONFIG.PF2E.Item.documentClasses.weapon.prototype.prepareBaseData'
const PREPARE_WEAPON_DERIVED_DATA = 'CONFIG.PF2E.Item.documentClasses.weapon.prototype.prepareDerivedData'
const PREPARE_ARMOR_DATA = 'CONFIG.PF2E.Item.documentClasses.armor.prototype.prepareBaseData'
const PREPARE_ARMOR_DERIVED_DATA = 'CONFIG.PF2E.Item.documentClasses.armor.prototype.prepareDerivedData'

const WEAPON_EXCLUDES = ['Compendium.pf2e.equipment-srd.Item.ZhxxqYpVdVx0jSMm']

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
            if (!getSetting('arp')) return
            registerWrapper(PREPARE_WEAPON_DATA, onPrepareWeaponData, 'WRAPPER')
            registerWrapper(PREPARE_WEAPON_DERIVED_DATA, onPrepareWeaponDerivedData, 'WRAPPER')
            registerWrapper(PREPARE_ARMOR_DATA, onPrepareArmorData, 'WRAPPER')
            registerWrapper(PREPARE_ARMOR_DERIVED_DATA, onPrepareArmorDerivedData, 'WRAPPER')
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

function isValidWeapon(weapon) {
    const traits = weapon._source.system.traits.value
    return !traits.includes('alchemical') && !traits.includes('bomb') && !WEAPON_EXCLUDES.includes(weapon.sourceId)
}

function onPrepareWeaponData(wrapped) {
    const actor = this.actor
    if (!isValidActor(actor, true) || !isValidWeapon(this)) return wrapped()

    const level = actor.level

    const traits = this._source.system.traits.value
    if (traits.includes('alchemical') && traits.includes('bomb')) return wrapped()

    this.system.potencyRune.value = level < 2 ? null : level < 10 ? 1 : level < 16 ? 2 : 3
    this.system.strikingRune.value = level < 4 ? null : level < 12 ? 'striking' : level < 19 ? 'greaterStriking' : 'majorStriking'

    wrapped()
}

const WEAPON_POTENCY_PRICE = {
    1: 35,
    2: 935,
    3: 8935,
    4: 8935,
}
const WEAPON_STRIKING_PRICE = {
    striking: 65,
    greaterStriking: 1065,
    majorStriking: 31065,
}
function onPrepareWeaponDerivedData(wrapped) {
    wrapped()

    if (!isValidActor(this.actor) || this.isSpecific || !isValidWeapon(this)) return

    let gp = this.price.value.goldValue

    const potency = this.system.potencyRune.value
    if (potency) gp -= WEAPON_POTENCY_PRICE[potency]

    const striking = this.system.strikingRune.value
    if (striking) gp -= WEAPON_STRIKING_PRICE[striking]

    if ((potency || striking) && !this.system.runes.property.length)
        gp += new game.pf2e.Coins(this._source.system.price.value).goldValue

    this.system.price.value = new game.pf2e.Coins({ gp })
}

function isValidArmor(armor) {
    return !armor.isShield
}

function onPrepareArmorData(wrapped) {
    const actor = this.actor
    if (!isValidActor(actor, true) || !isValidArmor(this)) return wrapped()

    const level = actor.level

    this.system.potencyRune.value = level < 5 ? null : level < 11 ? 1 : level < 18 ? 2 : 3
    this.system.resiliencyRune.value =
        level < 8 ? null : level < 14 ? 'resilient' : level < 20 ? 'greaterResilient' : 'majorResilient'

    wrapped()
}

const ARMOR_POTENCY_PRICE = {
    1: 160,
    2: 1060,
    3: 20560,
    4: 20560,
}
const ARMOR_RESILIENCY_PRICE = {
    resilient: 340,
    greaterResilient: 3440,
    majorResilient: 49440,
}
function onPrepareArmorDerivedData(wrapped) {
    wrapped()

    if (!isValidActor(this.actor) || this.isSpecific || !isValidArmor(this)) return

    let gp = this.price.value.goldValue

    const potency = this.system.potencyRune.value
    if (potency) gp -= ARMOR_POTENCY_PRICE[potency]

    const resiliency = this.system.resiliencyRune.value
    if (resiliency) gp -= ARMOR_RESILIENCY_PRICE[resiliency]

    if ((potency || resiliency) && !this.system.runes.property.length)
        gp += new game.pf2e.Coins(this._source.system.price.value).goldValue

    this.system.price.value = new game.pf2e.Coins({ gp })
}
