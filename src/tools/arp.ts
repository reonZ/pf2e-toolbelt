import {
    activateHooksAndWrappers,
    ActorPF2e,
    ArmorPF2e,
    Coins,
    createToggleableWrapper,
    isSF2eItem,
    R,
    ShieldPF2e,
    SYSTEM,
    WeaponPF2e,
    ZeroToFour,
    ZeroToSix,
} from "module-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";
import { sharedArmorPrepareBaseData, sharedWeaponPrepareBaseData } from "tools";

const HANDWRAPS_SLUG = "handwraps-of-mighty-blows";
const STRIKING_SHIELDS = ["shield-boss", "shield-spikes"];

const GRADES = ["commercial", "tactical", "advanced", "superior", "elite", "ultimate", "paragon"] as const;

class ArpTool extends ModuleTool<ToolSettings> {
    #baseWrappers = [
        sharedWeaponPrepareBaseData.register(this.#weaponPrepareBaseData, { context: this }),
        sharedArmorPrepareBaseData.register(this.#armorPrepareBaseData, { context: this }),
    ];

    #basePriceWrappers = [
        createToggleableWrapper(
            "WRAPPER",
            "CONFIG.PF2E.Item.documentClasses.weapon.prototype.prepareDerivedData",
            this.#weaponPrepareDerivedData,
            { context: this },
        ),
        createToggleableWrapper(
            "WRAPPER",
            "CONFIG.PF2E.Item.documentClasses.armor.prototype.prepareDerivedData",
            this.#armorPrepareDerivedData,
            { context: this },
        ),
    ];

    #shieldPrepareBaseDataWrapper = createToggleableWrapper(
        "WRAPPER",
        "CONFIG.PF2E.Item.documentClasses.shield.prototype.prepareBaseData",
        this.#shieldPrepareBaseData,
        { context: this },
    );
    #shieldPrepareDeriveDataWrapper = createToggleableWrapper(
        "WRAPPER",
        "CONFIG.PF2E.Item.documentClasses.shield.prototype.prepareDerivedData",
        this.#shieldPrepareDerivedData,
        { context: this },
    );

    static WEAPON_POTENCY_PRICE = {
        1: 35,
        2: 935,
        3: 8935,
        4: 8935,
    };

    static WEAPON_STRIKING_PRICE = {
        1: 65,
        2: 1065,
        3: 31065,
        4: 31065,
    };

    static ARMOR_POTENCY_PRICE = {
        1: 160,
        2: 1060,
        3: 20560,
        4: 20560,
    };

    static ARMOR_RESILIENCY_PRICE = {
        1: 340,
        2: 3440,
        3: 49440,
        4: 49440,
    };

    static SHIELD_REINFORCING_PRICE = {
        1: 75,
        2: 300,
        3: 900,
        4: 2500,
        5: 8000,
        6: 32000,
    };

    static SHIELD_HP = {
        0: { extra: 0, max: 0 },
        1: { extra: 44, max: 64 },
        2: { extra: 52, max: 80 },
        3: { extra: 64, max: 104 },
        4: { extra: 80, max: 120 },
        5: { extra: 84, max: 136 },
        6: { extra: 108, max: 160 },
    };

    get key(): "arp" {
        return "arp";
    }

    get settingsSchema(): ToolSettingsList<ToolSettings> {
        return [
            {
                key: "enabled",
                type: Boolean,
                default: false,
                scope: "world",
                requiresReload: true,
            },
            {
                key: "force",
                type: Boolean,
                default: true,
                scope: "world",
                requiresReload: true,
            },
            {
                key: "price",
                type: Boolean,
                default: true,
                scope: "world",
                requiresReload: true,
            },
            {
                key: "shield",
                type: Boolean,
                default: false,
                scope: "world",
                requiresReload: true,
            },
        ];
    }

    init(): void {
        if (!this.settings.enabled) return;

        const priceEnabled = this.settings.price;

        activateHooksAndWrappers(this.#baseWrappers);

        if (priceEnabled) {
            activateHooksAndWrappers(this.#basePriceWrappers);
        }

        if (this.settings.shield) {
            this.#shieldPrepareBaseDataWrapper.activate();

            if (priceEnabled) {
                this.#shieldPrepareDeriveDataWrapper.activate();
            }
        }
    }

    // this is a shared wrapper listener
    #weaponPrepareBaseData(weapon: WeaponPF2e<ActorPF2e>) {
        const actor = weapon.actor;
        if (!isValidActor(actor, true) || !isValidWeapon(weapon)) return;

        const force = this.settings.force;
        const level = actor.level;

        if (isSF2eItem(weapon)) {
            updateItemGrade(level, force, weapon);
            return;
        }

        const expectedPotency: ZeroToFour = level < 2 ? 0 : level < 10 ? 1 : level < 16 ? 2 : 3;
        const expectedStriking: ZeroToFour = level < 4 ? 0 : level < 12 ? 1 : level < 19 ? 2 : 3;

        if (force || weapon.system.runes.potency < expectedPotency) {
            weapon.system.runes.potency = expectedPotency;
        }

        if (force || weapon.system.runes.striking < expectedStriking) {
            weapon.system.runes.striking = expectedStriking;
        }
    }

    #weaponPrepareDerivedData(weapon: WeaponPF2e<ActorPF2e>, wrapped: libWrapper.RegisterCallback) {
        wrapped();

        if (!isValidActor(weapon.actor) || !isValidWeapon(weapon)) return;

        const coins = weapon.price.value.toObject();
        if (!coins.gp) return;

        if (isSF2eItem(weapon)) {
            updateItemPriceByGrade(coins, weapon);
            return;
        }

        const potency = weapon.system.runes.potency;
        const striking = weapon.system.runes.striking;

        if (potency) {
            coins.gp -= ArpTool.WEAPON_POTENCY_PRICE[potency];
        }

        if (striking) {
            coins.gp -= ArpTool.WEAPON_STRIKING_PRICE[striking];
        }

        let newPrice = new game.pf2e.Coins(coins);

        if ((potency || striking) && !weapon.system.runes.property.length) {
            newPrice = newPrice.plus(weapon._source.system.price.value);
        }

        weapon.system.price.value = newPrice;
    }

    // this is a shared wrapper listener
    #armorPrepareBaseData(armor: ArmorPF2e<ActorPF2e>) {
        const actor = armor.actor;
        if (!isValidActor(actor, true) || !isValidArmor(armor)) return;

        const force = this.settings.force;
        const level = actor.level;

        if (isSF2eItem(armor)) {
            updateItemGrade(level, force, armor);
            return;
        }

        const expectedPotency: ZeroToFour = level < 5 ? 0 : level < 11 ? 1 : level < 18 ? 2 : 3;
        const expectedResilient: ZeroToFour = level < 8 ? 0 : level < 14 ? 1 : level < 20 ? 2 : 3;

        if (force || armor.system.runes.potency < expectedPotency) {
            armor.system.runes.potency = expectedPotency;
        }

        if (force || armor.system.runes.resilient < expectedResilient) {
            armor.system.runes.resilient = expectedResilient;
        }
    }

    #armorPrepareDerivedData(armor: ArmorPF2e<ActorPF2e>, wrapped: libWrapper.RegisterCallback) {
        wrapped();

        if (!isValidActor(armor.actor) || !isValidArmor(armor)) return;

        const coins = armor.price.value.toObject();
        if (!coins.gp) return;

        if (isSF2eItem(armor)) {
            updateItemPriceByGrade(coins, armor);
            return;
        }

        const potency = armor.system.runes.potency;
        const resiliency = armor.system.runes.resilient;

        if (potency) {
            coins.gp -= ArpTool.ARMOR_POTENCY_PRICE[potency];
        }

        if (resiliency) {
            coins.gp -= ArpTool.ARMOR_RESILIENCY_PRICE[resiliency];
        }

        let newPrice = new game.pf2e.Coins(coins);

        if ((potency || resiliency) && !armor.system.runes.property.length) {
            newPrice = newPrice.plus(armor._source.system.price.value);
        }

        armor.system.price.value = newPrice;
    }

    #shieldPrepareBaseData(shield: ShieldPF2e<ActorPF2e>, wrapped: libWrapper.RegisterCallback) {
        const actor = shield.actor;

        if (!isValidActor(actor, true) || !isValidShield(shield)) {
            wrapped();
            return;
        }

        const force = this.settings.force;
        const level = actor.level;

        if (isSF2eItem(shield)) {
            updateItemGrade(level, force, shield);
        } else {
            // 4, 7, 10, 13, 16, 19
            const expected = Math.min(Math.ceil((level - 3) / 3), 6) as ZeroToSix;

            if (force || shield.system.runes.reinforcing < expected) {
                shield.system.runes.reinforcing = expected;
            }
        }

        wrapped();
    }

    #shieldPrepareDerivedData(shield: ShieldPF2e<ActorPF2e>, wrapped: libWrapper.RegisterCallback) {
        wrapped();

        if (!isValidActor(shield.actor) || !isValidShield(shield)) return;

        const coins = shield.price.value.toObject();
        if (!coins.gp) return;

        if (isSF2eItem(shield)) {
            updateItemPriceByGrade(coins, shield);
            return;
        }

        const reinforcing = shield.system.runes.reinforcing;

        if (reinforcing) {
            coins.gp -= ArpTool.SHIELD_REINFORCING_PRICE[reinforcing];
        }

        shield.system.price.value = new game.pf2e.Coins(coins);
    }
}

function getExpectedGrade(level: number, type: ItemCategory): number {
    const improvements = CONFIG.PF2E[`${type}Improvements`];

    for (let i = 0; i < 6; i++) {
        const nextGrade = GRADES[i + 1];
        const nextLevel = improvements[nextGrade].level;

        if (level < nextLevel) {
            return i;
        }
    }

    return 6;
}

function updateItemGrade(level: number, force: boolean, item: ItemType) {
    const type = item.type as ItemCategory;
    const expected = getExpectedGrade(level, type);

    if (force || GRADES.indexOf(item.system.grade ?? "commercial") < expected) {
        item.system.grade = GRADES[expected];
    }

    return;
}

function updateItemPriceByGrade(coins: Coins, item: ItemType) {
    const grade = item.system.grade;

    if (R.isIncludedIn(grade, GRADES)) {
        const type = item.type as ItemCategory;
        (coins as { gp: number }).gp -= CONFIG.PF2E[`${type}Improvements`][grade].credits / 10;
        item.system.price.value = new game.pf2e.Coins(coins);
    }
}

function isValidActor(actor: Maybe<ActorPF2e>, isCharacter = false): actor is ActorPF2e {
    return !!actor && !SYSTEM.getFlag(actor, "disableABP") && (!isCharacter || actor.isOfType("character"));
}

function isValidArmor(armor: ArmorPF2e<ActorPF2e>): boolean {
    return !armor._source.system.specific;
}

function isValidShield(shield: ShieldPF2e<ActorPF2e>): boolean {
    return !shield._source.system.specific;
}

function isValidWeapon(weapon: WeaponPF2e<ActorPF2e>): boolean {
    const { specific, category, group, baseItem, traits } = weapon._source.system;

    if (specific) {
        return false;
    }

    if (category === "unarmed" && !isHandwrap(weapon)) {
        return hasHandwrap(weapon.actor);
    }

    if (group === "shield" && (!baseItem || !STRIKING_SHIELDS.includes(baseItem))) {
        return false;
    }

    return !traits.value.includes("alchemical") && !traits.value.includes("bomb");
}

function isHandwrap(weapon: WeaponPF2e<ActorPF2e>): boolean {
    const { slug, traits } = weapon._source.system;
    return slug === HANDWRAPS_SLUG || traits.otherTags.includes(HANDWRAPS_SLUG);
}

function hasHandwrap(actor: ActorPF2e): boolean {
    return actor.itemTypes.weapon.some((weapon) => {
        const { equipped, identification, category, traits } = weapon._source.system;
        const { carryType, invested, inSlot } = equipped;

        return (
            category === "unarmed" &&
            isHandwrap(weapon) &&
            carryType === "worn" &&
            inSlot &&
            identification.status === "identified" &&
            (!traits.value.includes("invested") || invested)
        );
    });
}

type ItemType = WeaponPF2e | ArmorPF2e | ShieldPF2e;

type ItemCategory = "weapon" | "armor" | "shield";

type ToolSettings = {
    enabled: boolean;
    force: boolean;
    price: boolean;
    shield: boolean;
};

export { ArpTool };
