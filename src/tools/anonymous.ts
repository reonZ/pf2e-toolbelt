import {
    ChatLogPF2e,
    ChatMessagePF2e,
    createHook,
    htmlQuery,
    isActionMessage,
    isSpellMessage,
} from "module-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";
import { sharedMessageRenderHTML } from "./_shared";

const ANONYMOUS: {
    type: "action" | "spell";
    icon: string;
    test: (message: Maybe<ChatMessagePF2e>) => message is ChatMessagePF2e;
}[] = [
    {
        type: "action",
        icon: "",
        test: isValidActionMessage,
    },
    {
        type: "spell",
        icon: "fa-solid fa-wand-magic-sparkles",
        test: isValidSpellMessage,
    },
];

class AnonymousTool extends ModuleTool<ToolSettings> {
    #getChatContextOptionsHook = createHook(
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
                key: "action",
                type: Boolean,
                default: false,
                scope: "world",
                requiresReload: true,
            },
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
        if (this.settings.spell || this.settings.action) {
            this.#messageRenderHTMLWrapper.activate();
            this.#getChatContextOptionsHook.toggle(isGM);
        }
    }

    #onGetChatMessageContextOptions(chat: ChatLogPF2e, options: ContextMenuEntry[]) {
        const getMessage = (el: HTMLElement) => {
            const messageId = el.dataset.messageId;
            return game.messages.get(messageId ?? "");
        };

        for (const { icon, test, type } of ANONYMOUS) {
            options.push({
                name: this.localizePath(`${type}.context`),
                icon: `<i class="${icon}"></i>`,
                condition: (el) => {
                    const msg = getMessage(el);
                    return this.settings[type] && test(msg) && !this.getFlag(msg, "revealed");
                },
                callback: (el) => {
                    const message = getMessage(el);
                    if (message) {
                        this.setFlag(message, "revealed", true);
                    }
                },
            });
        }
    }

    async #messageRenderHTML(message: ChatMessagePF2e, html: HTMLElement) {
        if (this.getFlag(message, "revealed")) return;

        const isSpell = this.settings.spell && isValidSpellMessage(message);
        const isAction = !isSpell && this.settings.action && isValidActionMessage(message);
        if (!isSpell && !isAction) return;

        const chatCard = htmlQuery(html, ".chat-card");
        if (!chatCard) return;

        if (game.user.isGM) {
            html.classList.add("pf2e-toolbelt-anonymous");
            return;
        }

        const type = isSpell ? "spell" : "action";
        const header = htmlQuery(chatCard, ".card-header");
        const cardContent = htmlQuery(chatCard, ".card-content");
        const footer = htmlQuery(chatCard, ":scope > footer");

        if (header) {
            const txt = this.localize(`${type}.header`);
            header.innerHTML = `<h3>${txt}</h3>`;
        }

        cardContent?.remove();
        footer?.remove();
    }
}

function isValidActionMessage(message: Maybe<ChatMessagePF2e>): message is ChatMessagePF2e {
    return isValideMessage(message) && isActionMessage(message);
}

function isValidSpellMessage(message: Maybe<ChatMessagePF2e>): message is ChatMessagePF2e {
    return isValideMessage(message) && isSpellMessage(message);
}

function isValideMessage(message: Maybe<ChatMessagePF2e>): message is ChatMessagePF2e {
    if (!message) return false;

    const actor = message.item?.actor;
    return !!actor && !actor.hasPlayerOwner;
}

type ToolSettings = {
    action: boolean;
    spell: boolean;
};

export { AnonymousTool };
