import {
    ChatLogPF2e,
    ChatMessagePF2e,
    createHook,
    htmlQuery,
    isSpellMessage,
} from "module-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";
import { sharedMessageRenderHTML } from "./_shared";

class AnonymousTool extends ModuleTool<ToolSettings> {
    #getChatContextOptionsHooks = createHook(
        "getChatMessageContextOptions",
        this.#onGetChatMessageContextOptions.bind(this)
    );

    #messageRenderHTMLWrapper = sharedMessageRenderHTML.register(this.#messageRenderHTML, {
        context: this,
    });

    get key(): "anonymous" {
        return "anonymous";
    }

    get settingsSchema(): ToolSettingsList<ToolSettings> {
        return [
            {
                key: "spell",
                type: Boolean,
                default: false,
                scope: "world",
                requiresReload: true,
            },
        ];
    }

    init(isGM: boolean): void {
        if (this.settings.spell) {
            this.#messageRenderHTMLWrapper.activate();
            this.#getChatContextOptionsHooks.toggle(isGM);
        }
    }

    #onGetChatMessageContextOptions(chat: ChatLogPF2e, options: ContextMenuEntry[]) {
        const getMessage = (el: HTMLElement) => {
            const messageId = el.dataset.messageId;
            return game.messages.get(messageId ?? "");
        };

        options.push({
            name: this.localizePath("spell.context"),
            icon: `<i class="fa-solid fa-wand-magic-sparkles"></i>`,
            condition: (el) => {
                const message = getMessage(el);
                return isValidSpellMessage(message) && !this.getFlag(message, "revealed");
            },
            callback: (el) => {
                const message = getMessage(el);
                if (message) {
                    this.setFlag(message, "revealed", true);
                }
            },
        });
    }

    async #messageRenderHTML(message: ChatMessagePF2e, html: HTMLElement) {
        if (!isValidSpellMessage(message) || this.getFlag(message, "revealed")) return;

        const chatCard = htmlQuery(html, ".chat-card");
        if (!chatCard) return;

        if (game.user.isGM) {
            html.classList.add("pf2e-toolbelt-anonymous");
            return;
        }

        const header = htmlQuery(chatCard, ".card-header");
        const cardContent = htmlQuery(chatCard, ".card-content");
        const footer = htmlQuery(chatCard, ":scope > footer");

        if (header) {
            const txt = this.localize("spell.header");
            header.innerHTML = `<h3>${txt}</h3>`;
        }

        cardContent?.remove();
        footer?.remove();
    }
}

function isValidSpellMessage(message: Maybe<ChatMessagePF2e>): message is ChatMessagePF2e {
    if (!message || !isSpellMessage(message)) return false;

    const actor = message.item?.actor;
    return !!actor && !actor.hasPlayerOwner;
}

type ToolSettings = {
    spell: boolean;
};

export { AnonymousTool };
