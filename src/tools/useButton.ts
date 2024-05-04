import {
    createHTMLFromString,
    elementData,
    getActionGlyph,
    htmlElement,
    renderCharacterSheets,
    selfApplyEffectFromMessage,
} from "pf2e-api";
import { createTool } from "../tool";
import {
    CHARACTER_SHEET_ACTIVATE_LISTENERS,
    CHARACTER_SHEET_RENDER_INNER,
} from "./shared/characterSheet";

const debouncedSetup = debounce(setup, 1);

const { config, settings, hook, wrappers } = createTool({
    name: "useButton",
    settings: [
        {
            key: "actions",
            type: Boolean,
            default: false,
            scope: "client",
            onChange: debouncedSetup,
        },
        {
            key: "consumables",
            type: Boolean,
            default: false,
            scope: "client",
            onChange: debouncedSetup,
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

function setup() {
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
            if (!item?.isOfType("consumable")) continue;

            const [type, tooltip] =
                item.uses.value < 1
                    ? ["span", "PF2E.Item.Consumable.Uses.None"]
                    : ["a", "PF2E.Action.Use"];
            const template = `<${type} class="use-consumable" data-action="use-consumable" 
            data-tooltip="${tooltip}">
                <i class="fa-solid fa-play"></i>
            </${type}>`;

            const btn = createHTMLFromString(template);

            if (type === "a") {
                btn.addEventListener("click", (event) => {
                    event.preventDefault();

                    const { value } = item.uses;
                    if (value < 1) return;

                    item.consume();
                });
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

            const actionIcon = getActionGlyph(item.actionCost);
            const disabled = item.frequency.value < 1 ? "disabled" : "";
            const template = `<div class="button-group">
            <button type="button" class="use-action" data-action="toolbelt-use-action" ${disabled}>
                <span>${useLabel}</span>
                <span class="action-glyph">${actionIcon}</span>
            </button>
        </div>`;
            const btn = createHTMLFromString(template);

            btn.addEventListener("click", async (event) => {
                event.preventDefault();

                const { value } = item.frequency!;
                if (value < 1) return;

                await item.update({ "system.frequency.value": value - 1 });
                item.toMessage(event);
            });

            actionElement.querySelector(".button-group")?.append(btn);
        }
    }
}

function characterSheetPF2eActivateListeners(this: CharacterSheetPF2e, html: HTMLElement) {
    const actor = this.actor;
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
