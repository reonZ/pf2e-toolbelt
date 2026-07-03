import {
    AreaAttack,
    AreaAttackContextFlag,
    ChatMessagePF2e,
    CreaturePF2e,
    htmlQuery,
    isAreaOrAutoFireType,
    ItemPF2e,
    MeleePF2e,
    MODULE,
    SYSTEM,
    WeaponPF2e,
} from "foundry-helpers";
import { isMessageOwner, renderSpellCardLikeMessage, TargetHelperTool } from ".";
import { SaveVariantsSource, TargetsData, TargetsDataSource } from "..";
import { createHTMLElement } from "foundry-helpers/src";

const EXTRA_AREA_OPTIONS = ["damaging-effect", "area-damage", "area-effect"];

function isAreaMessage(message: ChatMessagePF2e): boolean {
    const context = message.flags[SYSTEM.id].context;
    return isAreaOrAutoFireType(context?.type ?? "");
}

function prepareAreaMessage(this: TargetHelperTool, message: ChatMessagePF2e, updates: TargetsDataSource): boolean {
    const saveVariants = getAreaSaveVariants(message);
    if (!saveVariants) return false;

    updates.author = message.item?.actor.uuid;
    updates.type = "area";

    updates.options ??= [];
    updates.options.push(...EXTRA_AREA_OPTIONS);

    if (!this.getMessageSaveVariants(message)) {
        updates.saveVariants = saveVariants;
    }

    return true;
}

async function renderAreaMessage(
    this: TargetHelperTool,
    message: ChatMessagePF2e,
    html: HTMLElement,
    data: TargetsData,
) {
    const item = message.item;
    const msgContent = htmlQuery(html, ".message-content");
    if (!msgContent || !isValidItem(item)) return;

    const context = message.flags[SYSTEM.id].context as AreaAttackContextFlag;

    const expendBtn = createAreaExpendBtn.call(this, message, data, context.type);
    if (expendBtn) {
        const buttonsWrapper = createHTMLElement("div", {
            classes: ["pf2e-toolbelt-target-buttons"],
            content: expendBtn,
        });

        const damageBtn = htmlQuery(msgContent, `.message-buttons [data-action="roll-area-damage"]`);

        if (damageBtn) {
            damageBtn.replaceWith(buttonsWrapper);
            buttonsWrapper.append(damageBtn);
        }
    }

    return renderSpellCardLikeMessage.call(
        this,
        message,
        msgContent,
        data,
        item,
        `.message-buttons [data-action="roll-area-save"]`,
        `.message-buttons [data-action="roll-area-damage"]`,
    );
}

function createAreaExpendBtn(
    this: TargetHelperTool,
    message: ChatMessagePF2e,
    data: TargetsData,
    type: "area-fire" | "auto-fire",
): HTMLButtonElement | undefined {
    const item = message.item;
    if (!item?.isOfType("weapon")) return;

    const isGrenade = item.system.baseItem === "grenade";
    if (!isGrenade && !item.system.ammo) return;

    const nb = data.targets.length;
    const expended = data.expended;
    if (expended < 1 && nb < 1) return;

    const iconPath = isGrenade
        ? MODULE.imagePath("grenade", "svg")
        : SYSTEM.relativePath("assets/icons/heavy-bullets.svg");

    const totalExpend = isGrenade ? 1 : type === "auto-fire" ? nb * 2 : item.system.expend || 1;

    const hasExpended = expended > 0;
    const displayedExpend = isGrenade ? "" : hasExpended ? expended : totalExpend;

    const tooltip = this.localize("expend-ammo", hasExpended ? "expended" : "expend", isGrenade ? "grenade" : "ammo", {
        expend: type === "auto-fire" ? `${nb}x2` : totalExpend,
        nb: totalExpend,
    });

    const btn = createHTMLElement("button", {
        classes: ["pf2e-toolbelt-target-expend"],
        content: `<i style="background-image: url(${iconPath});"></i><span>${displayedExpend}</span>`,
        dataset: { tooltip },
    });

    if (hasExpended) {
        btn.disabled = true;
    }

    if (hasExpended || !isMessageOwner(message)) {
        return btn;
    }

    btn.addEventListener("click", async () => {
        if (isGrenade) {
            if (item.quantity < 1) {
                return this.localize.warning("expend-ammo.warning.grenade");
            } else {
                // we don't delete grenades as it would mess with the re-rendering of the message
                await item.update({ "system.quantity": item.quantity - 1 });
            }

            return this.updateMessageEmitable.call({ message, expended: 1 });
        }

        const ammo = item.ammo;

        if (item.system.expend && ammo?.isOfType("ammo")) {
            if (ammo.uses.max > 1 ? ammo.uses.value < totalExpend : ammo.quantity < totalExpend) {
                return this.localize.warning("expend-ammo.warning.ammo");
            }

            await ammo.consume(totalExpend);
        } else if (ammo?.isOfType("weapon")) {
            if (ammo.quantity < totalExpend) {
                return this.localize.warning("expend-ammo.warning.ammo");
            }

            if (!ammo.system.usage.canBeAmmo) {
                return this.localize.warning("expend-ammo.warning.error");
            }

            await ammo.update({ "system.quantity": ammo.quantity - totalExpend });
        } else {
            return this.localize.warning("expend-ammo.warning.error");
        }

        this.updateMessageEmitable.call({ message, expended: totalExpend });
    });

    return btn;
}

function getAreaSaveVariants(message: ChatMessagePF2e): SaveVariantsSource | null {
    const item = message.item;
    if (!isValidItem(item)) return null;

    const strike = item.actor.system.actions?.find((strike): strike is AreaAttack => strike.item === item);
    if (!strike) return null;

    const statistic = strike.statistic ?? (strike.altUsages?.at(0) as Maybe<AreaAttack>)?.statistic;
    if (!statistic) return null;

    return {
        null: {
            basic: true,
            dc: statistic.dc.value,
            statistic: "reflex",
        },
    };
}

function isValidItem(item: Maybe<ItemPF2e>): item is WeaponPF2e<CreaturePF2e> | MeleePF2e<CreaturePF2e> {
    return !!item?.isOfType("weapon", "melee") && !!item.actor?.isOfType("creature");
}

export { isAreaMessage, prepareAreaMessage, renderAreaMessage };
