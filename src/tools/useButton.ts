import {
    addListenerAll,
    closest,
    consumeItem,
    createHTMLFromString,
    elementData,
    getActionGlyph,
    htmlElement,
    querySelector,
    renderCharacterSheets,
    selfApplyEffectFromMessage,
} from "pf2e-api";
import { createTool } from "../tool";
import {
    CHARACTER_SHEET_ACTIVATE_LISTENERS,
    CHARACTER_SHEET_RENDER_INNER,
} from "./shared/characterSheet";

const debouncedSetupWrappers = debounce(setupWrappers, 1);

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
    const useLabel = game.i18n.localize("PF2E.Action.Use");

    if (settings.consumables) {
        const consumableElements = html.querySelectorAll(
            ".tab[data-tab='inventory'] .inventory-list [data-item-types='consumable'] > [data-item-id]"
        );
        for (const consumableElement of consumableElements) {
            const { itemId } = elementData(consumableElement);
            const item = actor.items.get(itemId);
            if (!item?.isOfType("consumable") || item.category === "ammo") continue;

            const [type, tooltip] =
                item.uses.value < 1
                    ? ["span", "PF2E.Item.Consumable.Uses.None"]
                    : ["a", "PF2E.Action.Use"];
            const template = `<${type} class="use-consumable" data-tooltip="${tooltip}">
                <i class="fa-solid fa-play"></i>
            </${type}>`;

            const btn = createHTMLFromString(template);

            if (item.uses.value) {
                btn.dataset.action = "toolbelt-use-consumable";
            }

            consumableElement.querySelector(".item-controls")?.prepend(btn);
        }
    }

    if (settings.actions) {
        const actionElements = html.querySelectorAll(
            ".tab[data-tab='actions'] .actions-list:not(.heroActions-list):not(.strikes-list) .action[data-item-id]"
        );
        for (const actionElement of actionElements) {
            const { itemId } = elementData(actionElement);
            const item = actor.items.get(itemId);
            if (!item?.isOfType("feat", "action") || !item.frequency) continue;

            let btn: HTMLButtonElement | null;

            if (item.system.selfEffect) {
                btn = actionElement.querySelector<HTMLButtonElement>("[data-action='use-action']");
            } else {
                const actionIcon = getActionGlyph(item.actionCost);
                const template = `<div class="button-group">
                    <button type="button" class="use-action">
                            <span>${useLabel}</span>
                            <span class="action-glyph">${actionIcon}</span>
                    </button>
                </div>`;

                const group = createHTMLFromString(template);

                btn = querySelector<HTMLButtonElement>(group, "button");
                actionElement.querySelector(".button-group")?.append(group);
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

function characterSheetPF2eActivateListeners(this: CharacterSheetPF2e, html: HTMLElement) {
    const actor = this.actor;

    const getItem = (btn: HTMLElement) => {
        const { itemId } = elementData(closest(btn, "[data-item-id]"));
        return actor.items.get<ItemPF2e<CharacterPF2e>>(itemId);
    };

    addListenerAll(html, "[data-action='toolbelt-use-consumable']", (event, btn) => {
        const item = getItem(btn);
        if (item?.isOfType("consumable") && item.category !== "ammo") {
            consumeItem(event, item);
        }
    });

    addListenerAll(
        html,
        ".use-action[data-toolbelt-use='true']",
        (event, btn: HTMLButtonElement) => {
            const item = getItem(btn);
            if (!item?.isOfType("feat", "action")) return;

            const { value } = item.frequency!;
            if (value < 1) return;

            item.update({ "system.frequency.value": value - 1 });

            if (!item.system.selfEffect) {
                item.toMessage(event);
            }
        }
    );
}

async function onCreateChatMessage(message: ChatMessagePF2e) {
    if (!message.isAuthor || message.getFlag("pf2e", "context.type") !== "self-effect") return;

    const hookId = Hooks.on("renderChatMessage", (msg: ChatMessagePF2e, $html: JQuery) => {
        if (msg !== message) return;

        const html = htmlElement($html);
        Hooks.off("renderChatMessage", hookId);
        selfApplyEffectFromMessage(message, html);
    });
}

export { config as useButtonTool };
