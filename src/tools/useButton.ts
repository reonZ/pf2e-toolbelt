import {
    addListenerAll,
    consumeItem,
    createHTMLElement,
    elementDataset,
    getActionGlyph,
    htmlClosest,
    renderCharacterSheets,
    selfApplyEffectFromMessage,
} from "foundry-pf2e";
import { createTool } from "../tool";
import { getActionMacro } from "./actionable";
import {
    CHARACTER_SHEET_ACTIVATE_LISTENERS,
    CHARACTER_SHEET_RENDER_INNER,
} from "./shared/characterSheet";

const debouncedSetupWrappers = foundry.utils.debounce(setupWrappers, 1);

const { config, settings, hook, wrappers } = createTool({
    name: "useButton",
    settings: [
        {
            key: "actions",
            type: Boolean,
            default: false,
            scope: "client",
            onChange: debouncedSetupWrappers,
        },
        {
            key: "consumables",
            type: Boolean,
            default: false,
            scope: "client",
            onChange: debouncedSetupWrappers,
        },
        {
            key: "selfApplied",
            type: Boolean,
            default: false,
            scope: "client",
            onChange: (value) => {
                hook.toggle(value);
            },
        },
    ],
    hooks: [
        {
            event: "createChatMessage",
            listener: onCreateChatMessage,
        },
    ],
    wrappers: [
        {
            path: CHARACTER_SHEET_RENDER_INNER,
            callback: characterSheetPF2eRenderInner,
        },
        {
            path: CHARACTER_SHEET_ACTIVATE_LISTENERS,
            callback: characterSheetPF2eActivateListeners,
        },
    ],
    ready: () => {
        hook.toggle(settings.selfApplied);
        wrappers.toggleAll(settings.actions || settings.consumables);
    },
} as const);

function setupWrappers() {
    wrappers.toggleAll(settings.actions || settings.consumables);
    renderCharacterSheets();
}

async function characterSheetPF2eRenderInner(this: CharacterSheetPF2e, html: HTMLElement) {
    const actor = this.actor;

    if (settings.consumables) {
        const consumableElements = html.querySelectorAll<HTMLElement>(
            ".tab[data-tab='inventory'] .inventory-list [data-item-types='consumable'] > [data-item-id]"
        );
        for (const consumableElement of consumableElements) {
            const { itemId } = elementDataset(consumableElement);
            const item = actor.items.get(itemId);
            if (!item?.isOfType("consumable") || !item.isIdentified || item.category === "ammo")
                continue;

            const [type, tooltip] =
                item.uses.value < 1
                    ? (["span", "PF2E.Item.Consumable.Uses.None"] as const)
                    : (["a", "PF2E.Action.Use"] as const);

            const btnElement = createHTMLElement(type, {
                classes: ["use-consumable"],
                dataset: { tooltip },
                innerHTML: "<i class='fa-solid fa-play'></i>",
            });

            if (item.uses.value) {
                btnElement.dataset.action = "toolbelt-use-consumable";
            }

            consumableElement.querySelector(".item-controls")?.prepend(btnElement);
        }
    }

    if (settings.actions) {
        const actionElements = html.querySelectorAll<HTMLElement>(
            ".tab[data-tab='actions'] .actions-list:not(.heroActions-list):not(.strikes-list) .action[data-item-id]"
        );
        for (const actionElement of actionElements) {
            const { itemId } = elementDataset(actionElement);
            const item = actor.items.get(itemId);
            if (
                !item?.isOfType("feat", "action") ||
                !item.frequency ||
                (await getActionMacro(item))
            ) {
                continue;
            }

            let btn: HTMLButtonElement | null;

            if (item.system.selfEffect) {
                btn = actionElement.querySelector<HTMLButtonElement>("[data-action='use-action']");
            } else {
                btn = createActionUseButton(item);
                actionElement.querySelector(".button-group")?.append(btn);
            }

            if (btn instanceof HTMLButtonElement) {
                if (item.frequency.value >= 1) {
                    btn.dataset.toolbeltUse = "true";
                } else {
                    btn.disabled = true;
                }
            }
        }
    }
}

function createActionUseButton(item: AbilityItemPF2e | FeatPF2e) {
    const useLabel = game.i18n.localize("PF2E.Action.Use");
    const actionIcon = getActionGlyph(item.actionCost);

    const btn = createHTMLElement("button", {
        classes: ["use-action"],
        innerHTML: `<span>${useLabel}</span><span class="action-glyph">${actionIcon}</span>`,
    });
    btn.type = "button";

    return btn;
}

function getItemFromActionButton(actor: CharacterPF2e, btn: HTMLButtonElement) {
    const { itemId } = elementDataset(htmlClosest(btn, "[data-item-id]")!);
    return actor.items.get(itemId);
}

function characterSheetPF2eActivateListeners(this: CharacterSheetPF2e, html: HTMLElement) {
    const actor = this.actor;

    addListenerAll(
        html,
        "[data-action='toolbelt-use-consumable']",
        (event, btn: HTMLButtonElement) => {
            const item = getItemFromActionButton(actor, btn);
            if (item?.isOfType("consumable") && item.category !== "ammo") {
                consumeItem(event, item);
            }
        }
    );

    addListenerAll(
        html,
        ".use-action[data-toolbelt-use='true']",
        (event, btn: HTMLButtonElement) => {
            const item = getItemFromActionButton(actor, btn);
            if (!item?.isOfType("feat", "action")) return;

            const { value } = item.frequency!;
            if (value < 1) return;

            item.update({ "system.frequency.value": value - 1 });

            if (!item.system.selfEffect && !btn.dataset.useActionMacro) {
                item.toMessage(event);
            }
        }
    );
}

async function onCreateChatMessage(message: ChatMessagePF2e) {
    if (!message.isAuthor || message.getFlag("pf2e", "context.type") !== "self-effect") return;

    const hookId = Hooks.on("renderChatMessage", (msg: ChatMessagePF2e, $html: JQuery) => {
        if (msg !== message) return;

        const html = $html[0];
        Hooks.off("renderChatMessage", hookId);
        selfApplyEffectFromMessage(message, html);
    });
}

export {
    createActionUseButton,
    getItemFromActionButton,
    config as useButtonTool,
    settings as useButtonToolSetting,
};
