import {
    ActorPF2e,
    ArmorPF2e,
    HANDWRAPS_SLUG,
    ItemSheetPF2e,
    PhysicalItemPF2e,
    WeaponPF2e,
    ZeroToFour,
    ZeroToThree,
    getEquippedHandwraps,
} from "module-helpers";
import { createTool } from "../tool";
import {
    ARMOR_PREPARE_BASE_DATA,
    ARMOR_PREPARE_DERIVED_DATA,
    WEAPON_PREPARE_BASE_DATA,
    WEAPON_PREPARE_DERIVED_DATA,
} from "./shared/prepareDocument";

const { config, localize, settings, hook, wrappers } = createTool({
    name: "arp",
    settings: [
        {
            key: "enabled",
            type: Boolean,
            default: false,
            requiresReload: true,
        },
        {
            key: "force",
            type: Boolean,
            default: true,
            requiresReload: true,
        },
    ],
    hooks: [
        {
            event: "renderPhysicalItemSheetPF2e",
            listener: onRenderPhysicalItemSheetPF2e,
        },
    ],
    wrappers: [
        {
            path: WEAPON_PREPARE_BASE_DATA,
            callback: weaponPrepareBaseData,
        },
        {
            path: WEAPON_PREPARE_DERIVED_DATA,
            callback: weaponPrepareDerivedData,
        },
        {
            path: ARMOR_PREPARE_BASE_DATA,
            callback: armorPrepareBaseData,
        },
        {
            path: ARMOR_PREPARE_DERIVED_DATA,
            callback: armorPrepareDerivedData,
        },
    ],
    init: () => {
        if (!settings.enabled) return;

        wrappers.activateAll();

        if (settings.force) {
            hook.activate();
        }
    },
    ready: (isGM) => {
        if (
            isGM &&
            settings.enabled &&
            game.settings.get("pf2e", "automaticBonusVariant") !== "noABP"
        ) {
            game.settings.set("pf2e", "automaticBonusVariant", "noABP");
            localize.warn("arp.forceVariant", true);
        }
    },
} as const);

const WEAPON_POTENCY_PRICE = {
    1: 35,
    2: 935,
    3: 8935,
    4: 8935,
};

const WEAPON_STRIKING_PRICE = {
    1: 65,
    2: 1065,
    3: 31065,
    4: 31065,
};

const ARMOR_POTENCY_PRICE = {
    1: 160,
    2: 1060,
    3: 20560,
    4: 20560,
};

const ARMOR_RESILIENCY_PRICE = {
    1: 340,
    2: 3440,
    3: 49440,
    4: 49440,
};

function isValidActor(actor: ActorPF2e, isCharacter = false) {
    return (
        actor &&
        !actor.getFlag("pf2e", "disableABP") &&
        (!isCharacter || actor.isOfType("character"))
    );
}

function isShieldWeapon(weapon: WeaponPF2e) {
    return (
        !!weapon._source.system.baseItem &&
        ["shield-boss", "shield-spikes"].includes(weapon._source.system.baseItem)
    );
}

function isValidWeapon(weapon: WeaponPF2e<ActorPF2e>) {
    const { group, category, slug, traits } = weapon._source.system;

    if (
        category === "unarmed" &&
        slug !== HANDWRAPS_SLUG &&
        !traits.otherTags.includes(HANDWRAPS_SLUG)
    ) {
        return !!getEquippedHandwraps(weapon.actor);
    }

    return (
        (group !== "shield" || isShieldWeapon(weapon)) &&
        !traits.value.includes("alchemical") &&
        !traits.value.includes("bomb")
    );
}

function isValidArmor(armor: ArmorPF2e) {
    return true;
}

function weaponPrepareBaseData(this: WeaponPF2e<ActorPF2e>) {
    const actor = this.actor;
    if (!isValidActor(actor, true) || !isValidWeapon(this)) return;

    const traits = this._source.system.traits.value;

    if (traits.includes("alchemical") && traits.includes("bomb")) return;

    const level = actor.level;
    const forceUpdate = settings.force;
    const expectedPotency: ZeroToFour = level < 2 ? 0 : level < 10 ? 1 : level < 16 ? 2 : 3;
    const expectedStriking: ZeroToThree = level < 4 ? 0 : level < 12 ? 1 : level < 19 ? 2 : 3;

    if (forceUpdate || this.system.runes.potency <= expectedPotency) {
        this.system.runes.potency = expectedPotency;
    }

    if (forceUpdate || this.system.runes.striking <= expectedStriking) {
        this.system.runes.striking = expectedStriking;
    }
}

function weaponPrepareDerivedData(
    this: WeaponPF2e<ActorPF2e>,
    wrapped: libWrapper.RegisterCallback
) {
    wrapped();

    if (!isValidActor(this.actor) || this.isSpecific || !isValidWeapon(this)) return;

    const coins = this.price.value.toObject();
    if (!coins.gp) return;

    const potency = this.system.runes.potency;
    const striking = this.system.runes.striking;

    if (potency) {
        coins.gp -= WEAPON_POTENCY_PRICE[potency];
    }

    if (striking) {
        coins.gp -= WEAPON_STRIKING_PRICE[striking];
    }

    let newPrice = new game.pf2e.Coins(coins);

    if ((potency || striking) && !this.system.runes.property.length) {
        newPrice = newPrice.plus(this._source.system.price.value);
    }

    this.system.price.value = newPrice;
}

function armorPrepareBaseData(this: ArmorPF2e<ActorPF2e>) {
    const actor = this.actor;

    if (!isValidActor(actor, true) || !isValidArmor(this)) return;

    const level = actor.level;
    const forceUpdate = settings.force;

    const expectedPotency: ZeroToFour = level < 5 ? 0 : level < 11 ? 1 : level < 18 ? 2 : 3;
    const expectedResilient: ZeroToThree = level < 8 ? 0 : level < 14 ? 1 : level < 20 ? 2 : 3;

    if (forceUpdate || this.system.runes.potency <= expectedPotency) {
        this.system.runes.potency = expectedPotency;
    }

    if (forceUpdate || this.system.runes.resilient <= expectedResilient) {
        this.system.runes.resilient = expectedResilient;
    }
}

function armorPrepareDerivedData(this: ArmorPF2e<ActorPF2e>, wrapped: libWrapper.RegisterCallback) {
    wrapped();

    if (!isValidActor(this.actor) || this.isSpecific || !isValidArmor(this)) return;

    const coins = this.price.value.toObject();
    if (!coins.gp) return;

    const potency = this.system.runes.potency;
    const resiliency = this.system.runes.resilient;

    if (potency) {
        coins.gp -= ARMOR_POTENCY_PRICE[potency];
    }

    if (resiliency) {
        coins.gp -= ARMOR_RESILIENCY_PRICE[resiliency];
    }

    let newPrice = new game.pf2e.Coins(coins);

    if ((potency || resiliency) && !this.system.runes.property.length) {
        newPrice = newPrice.plus(this._source.system.price.value);
    }

    this.system.price.value = newPrice;
}

function onRenderPhysicalItemSheetPF2e(
    sheet: ItemSheetPF2e<PhysicalItemPF2e<ActorPF2e>>,
    $html: JQuery
) {
    const item = sheet.item;

    if (!item.isOfType("weapon", "armor") || !isValidActor(item.actor, true)) return;

    const html = $html[0];
    const runesSection = html.querySelector(".material-runes");
    if (!runesSection) return;

    const lookups = ["potency", "striking", "resilient"]
        .map((x) => `[name="system.runes.${x}"]`)
        .join(", ");

    const groups = runesSection.querySelectorAll<HTMLElement>(
        `[data-tab=details] fieldset .form-group:has(${lookups})`
    );

    for (const group of groups) {
        group.style.display = "none";
    }
}

export { config as arpTool };
