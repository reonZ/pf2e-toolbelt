import {
    ChatLogPF2e,
    ChatMessagePF2e,
    createToggleableHook,
    CreaturePF2e,
    htmlQuery,
    isActionMessage,
    isSpellMessage,
    R,
    SpellcastingEntrySlots,
    SpellPF2e,
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
    #getChatContextOptionsHook = createToggleableHook(
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

        const cardContent = htmlQuery(chatCard, ".card-content");

        if (isSpell) {
            const members = partyKnowsSpell(message.item).map((actor) => actor.name);

            if (members.length) {
                const label = this.localize("revealed");
                const msg = `<strong>${label}</strong> ${members.join(", ")}`;
                const line = `<p class="item-block-line">${msg}</p>`;

                cardContent?.insertAdjacentHTML("afterbegin", line);
                return;
            }
        }

        if (game.user.isGM) {
            html.classList.add("pf2e-toolbelt-anonymous");
            return;
        }

        const type = isSpell ? "spell" : "action";
        const header = htmlQuery(chatCard, ".card-header");
        const tags = htmlQuery(header, ":scope > .tags")?.outerHTML ?? "";
        const footer = htmlQuery(chatCard, ":scope > footer");

        if (header) {
            const txt = this.localize(`${type}.header`);
            header.innerHTML = `${tags}<h3>${txt}</h3>`;
        }

        cardContent?.remove();
        footer?.remove();
    }
}

function partyKnowsSpell(spell: SpellPF2e): CreaturePF2e[] {
    const sourceId = spell.sourceId;
    const members = game.actors.party?.members ?? [];

    return members.filter((actor) => {
        return actor.itemTypes.spell.some((spell) => {
            if (spell.sourceId !== sourceId) return false;

            const entry = spell.spellcasting;
            if (!entry) return false;

            return (
                entry.category !== "prepared" ||
                R.values(entry.system?.slots ?? ({} as SpellcastingEntrySlots)).some((slot) => {
                    slot.prepared.some((prepared) => prepared.id === spell.id);
                })
            );
        });
    });
}

function isValidActionMessage(message: Maybe<ChatMessagePF2e>): message is ChatMessagePF2e {
    return isValideMessage(message) && isActionMessage(message);
}

function isValidSpellMessage(
    message: Maybe<ChatMessagePF2e>
): message is ChatMessagePF2e & { item: SpellPF2e } {
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
