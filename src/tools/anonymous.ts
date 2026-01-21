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
import { sharedMessageRenderHTML, TRAITS_BLACKLIST } from ".";

const TRAITS_SETTING = ["disabled", "all", "blacklist"] as const;

const CONTEXT_OPTIONS: {
    type: "action" | "spell";
    icon: string;
    test: (message: Maybe<ChatMessagePF2e>) => message is ChatMessagePF2e;
}[] = [
    {
        type: "action",
        icon: `<span class="action-glyph" style="height: 12px; width: 15px; margin-right: 8px; display: inline-flex; align-items: center; justify-content: center; font-size: 16px;">1</span>`,
        test: isValidActionMessage,
    },
    {
        type: "spell",
        icon: `<i class="fa-solid fa-wand-magic-sparkles"></i>`,
        test: isValidSpellMessage,
    },
];

class AnonymousTool extends ModuleTool<ToolSettings> {
    #traitsBlacklist?: string[];

    #getChatContextOptionsHook = createToggleableHook(
        "getChatMessageContextOptions",
        this.#onGetChatMessageContextOptions.bind(this),
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
            {
                key: "traits",
                type: String,
                default: "disabled",
                scope: "world",
                choices: TRAITS_SETTING,
                requiresReload: true,
            },
        ];
    }

    get traitsBlacklist() {
        return (this.#traitsBlacklist ??= TRAITS_BLACKLIST.map((trait) => CONFIG.PF2E.traitsDescriptions[trait]));
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

        for (const { icon, test, type } of CONTEXT_OPTIONS) {
            options.push({
                name: this.localizePath(`${type}.context`),
                icon,
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
            html.classList.add("pf2e-toolbelt-anonymous-gm");
            return;
        }

        html.classList.add("pf2e-toolbelt-anonymous-player");

        const type = isSpell ? "spell" : "action";
        const header = htmlQuery(chatCard, ".card-header");
        const footer = htmlQuery(chatCard, ":scope > footer");

        if (header) {
            const traits = this.settings.traits;
            const tags = htmlQuery(header, ":scope > .tags");

            header.innerHTML = `<h3>${this.localize(`${type}.header`)}</h3>`;

            if (traits === "blacklist") {
                for (const child of (tags?.children ?? []) as HTMLElement[]) {
                    if (R.isIncludedIn(child.dataset.tooltip, this.traitsBlacklist)) {
                        child.remove();
                    }
                }
            }

            if (traits !== "disabled") {
                header.innerHTML = `${tags?.outerHTML ?? ""}${header.innerHTML}`;
            }
        }

        cardContent?.remove();
        footer?.remove();
    }
}

function partyKnowsSpell(spell: SpellPF2e): CreaturePF2e[] {
    const sourceId = spell.sourceId;
    const members = game.actors.party?.members ?? [];

    return members.filter((actor) => {
        return actor.itemTypes.spell.some((item) => {
            if (item.sourceId !== sourceId) return false;

            const entry = item.spellcasting;
            if (!entry) return false;

            const spellId = item.id;

            return (
                entry.category !== "prepared" ||
                R.values(entry.system?.slots ?? ({} as SpellcastingEntrySlots)).some((slot) => {
                    slot.prepared.some((prepared) => prepared.id === spellId);
                })
            );
        });
    });
}

function isValidActionMessage(message: Maybe<ChatMessagePF2e>): message is ChatMessagePF2e {
    return isValideMessage(message) && isActionMessage(message);
}

function isValidSpellMessage(message: Maybe<ChatMessagePF2e>): message is ChatMessagePF2e & { item: SpellPF2e } {
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
    traits: (typeof TRAITS_SETTING)[number];
};

export { AnonymousTool };
