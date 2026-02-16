import { ChatMessagePF2e, DamageMessage, DamageRoll } from "foundry-helpers";
import { getSpellSaveVariants, TargetHelperTool, TargetsDataSource } from "..";

const THIRD_PATH_TO_PERFECTION = "Compendium.pf2e.classfeatures.Item.haoTkr2U5k7kaAKN";

const LEGENDARY_SAVES = [
    "Compendium.pf2e.classfeatures.Item.TuL0UfqH14MtqYVh", // Greater Juggernaut
    "Compendium.pf2e.classfeatures.Item.XFcCeBYqeXgfiA84", // Greater Dogged Will
    "Compendium.pf2e.classfeatures.Item.rpLPCkTXCZlQ51SR", // Greater Natural Reflexes
    "Compendium.pf2e.classfeatures.Item.BTpL6XvMk4jvVYYJ", // Greater Rogue Reflexes
    "Compendium.pf2e.classfeatures.Item.syEkISIi0F9946zo", // Assured Evasion
    "Compendium.pf2e.classfeatures.Item.Kj59CmXnMJDKXKWx", // Greater Mysterious Resolve
    "Compendium.pf2e.classfeatures.Item.mRobjNNsABQdUUZq", // Greater Performer's Heart
    "Compendium.pf2e.classfeatures.Item.Hw6Ji7Fgx0XkVkac", // Fortress of Will
    "Compendium.pf2e.classfeatures.Item.5LOARurr4qWkfS9K", // Greater Resolve
    "Compendium.pf2e.classfeatures.Item.i3qjbhL7uukg9I80", // Greater Kinetic Durability
];

function isDamageMessage(message: ChatMessagePF2e): message is DamageMessage {
    return message.isDamageRoll;
}

function prepareDamageMessage(
    this: TargetHelperTool,
    message: DamageMessage,
    updates: DeepPartial<TargetsDataSource>,
): boolean {
    if (isPersistentDamageMessage(message)) return false;

    updates.type = "damage";
    updates.isRegen = isRegenMessage(message);

    if (!this.getMessageSaveVariants(message)) {
        const saveVariants = getSpellSaveVariants(message);

        if (saveVariants) {
            updates.saveVariants = saveVariants;
        }
    }

    if (updates.isRegen) {
        const token = message.token;
        updates.targets = token ? [token.uuid] : [];
    }

    if (message.rolls.length === 2) {
        const splashRollIndex = message.rolls.findIndex((roll) => roll.options.splashOnly);
        const regularRollIndex = message.rolls.findIndex((roll: DamageRoll) => {
            return (
                !roll.options.splashOnly &&
                roll.options.damage?.modifiers?.some((modifier) => {
                    return (
                        ("category" in modifier && modifier.category === "splash") ||
                        ("damageCategory" in modifier && modifier.damageCategory === "splash")
                    );
                })
            );
        });

        if (splashRollIndex !== -1 && regularRollIndex !== -1) {
            updates.splashIndex = splashRollIndex;
        }
    }

    return true;
}

function isPersistentDamageMessage(message: ChatMessagePF2e): boolean {
    return !!message.rolls[0].options.evaluatePersistent;
}

let HEALINGS_REGEX;
function isRegenMessage(message: ChatMessagePF2e) {
    HEALINGS_REGEX ??= (() => {
        const healings = [
            game.i18n.localize("PF2E.Encounter.Broadcast.FastHealing.fast-healing.ReceivedMessage"),
            game.i18n.localize("PF2E.Encounter.Broadcast.FastHealing.regeneration.ReceivedMessage"),
        ];
        return new RegExp(`^<div>(${healings.join("|")})</div>`);
    })();
    return HEALINGS_REGEX.test(message.flavor);
}

export { isDamageMessage, prepareDamageMessage };
