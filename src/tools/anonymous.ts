import {
    ChatLogPF2e,
    ChatMessagePF2e,
    ContextMenuEntry,
    createToggleHook,
    CreaturePF2e,
    htmlQuery,
    isActionMessage,
    isSpellMessage,
    R,
    SpellcastingEntrySlots,
    SpellPF2e,
    SYSTEM,
} from "foundry-helpers";
import { ModuleTool, ToolSettingsList } from "module-tool";
import { sharedMessageRenderHTML } from ".";

export const TRAITS_BLACKLIST = ["curse", "disease", "fortune", "incapacitation", "misfortune", "mythic"] as const;

const TRAITS_SETTING = ["disabled", "all", "blacklist"] as const;

const CONTEXT_OPTIONS: {
    type: "action" | "spell";
    icon: string;
    test: (message: Maybe<ChatMessagePF2e>) => message is ChatMessagePF2e;
}[] = [
    {
        type: "action",
        icon: `<span class="action-glyph" style="height: 12px; width: 15px; margin-right: 8px; display: inline-flex; align-items: center; justify-content: center; font-size: 16px;">1</span>`,
        test: (message) => isValidMessage(message) && isValidActionMessage(message),
    },
    {
        type: "spell",
        icon: `<i class="fa-solid fa-wand-magic-sparkles"></i>`,
        test: (message) => isValidMessage(message) && isValidCoreSpellMessage(message),
    },
];

class AnonymousTool extends ModuleTool<ToolSettings> {
    #traitsBlacklist?: string[];

    #getChatContextOptionsHook = createToggleHook(
        "getChatMessageContextOptions",
        this.#onGetChatMessageContextOptions.bind(this),
    );

    #messageRenderHTMLWrapper = sharedMessageRenderHTML.register(this.#messageRenderHTML, { context: this });

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

    #onGetChatMessageContextOptions(_chat: ChatLogPF2e, options: ContextMenuEntry[]) {
        const getMessage = (el: HTMLElement) => {
            const messageId = el.dataset.messageId;
            return game.messages.get(messageId ?? "");
        };

        for (const { icon, test, type } of CONTEXT_OPTIONS) {
            options.push({
                name: this.localize.path(`${type}.context`),
                icon,
                condition: (el: HTMLElement) => {
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
        if (this.getFlag(message, "revealed") || !isValidMessage(message)) return;

        const isSpell = this.settings.spell && isValidSpellMessage(message);
        const isAction = !isSpell && this.settings.action && isValidActionMessage(message);
        if (!isSpell && !isAction) return;

        const isCoreSpell = isSpell && isSpellMessage(message);

        if (isCoreSpell) {
            const members = partyKnowsSpell(message.item).map((actor) => actor.name);

            if (members.length) {
                const label = this.localize("revealed");
                const msg = `<strong>${label}</strong> ${members.join(", ")}`;
                const line = `<p class="item-block-line">${msg}</p>`;

                htmlQuery(html, ".card-content")?.insertAdjacentHTML("afterbegin", line);
                return;
            }
        }

        if (game.user.isGM) {
            html.classList.add("pf2e-toolbelt-anonymous-gm");
            return;
        }

        html.classList.add("pf2e-toolbelt-anonymous-player");

        const traits = this.settings.traits;
        const isSpellDamage = isSpell && !isCoreSpell;
        const tagsSelector = isSpellDamage ? ".flavor-text > .tags:not(.modifiers)" : ".card-header > .tags";
        const tags = htmlQuery(html, tagsSelector);

        if (traits === "blacklist") {
            for (const child of (tags?.children ?? []) as HTMLElement[]) {
                if (R.isIncludedIn(child.dataset.tooltip, this.traitsBlacklist)) {
                    child.remove();
                }
            }
        }

        if (isSpellDamage) {
            const action = htmlQuery(html, ".flavor-text > .action");

            if (action) {
                const label = this.localize("spell.damage");
                action.innerHTML = `<strong>${label}</strong>`;
            }

            if (traits === "disabled") {
                tags?.remove();
            }
        } else {
            const cardHeader = htmlQuery(html, ".card-header");

            if (cardHeader) {
                const type = isSpell ? "spell" : "action";

                cardHeader.innerHTML = `<h3>${this.localize(`${type}.header`)}</h3>`;

                if (traits !== "disabled") {
                    cardHeader.innerHTML = `${tags?.outerHTML ?? ""}${cardHeader.innerHTML}`;
                }
            }
        }

        htmlQuery(html, ".card-content")?.remove();
        htmlQuery(html, ".chat-card > footer")?.remove();
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

function isValidActionMessage(message: ChatMessagePF2e): message is ChatMessagePF2e {
    return isActionMessage(message);
}

function isValidCoreSpellMessage(message: ChatMessagePF2e): message is ChatMessagePF2e & { item: SpellPF2e } {
    return isSpellMessage(message);
}

function isValidSpellMessage(message: ChatMessagePF2e): message is ChatMessagePF2e & { item: SpellPF2e } {
    return (
        !!message.item?.isOfType("spell") &&
        R.isIncludedIn(message.flags[SYSTEM.id].context?.type, ["spell-cast", "damage-roll"])
    );
}

function isValidMessage(message: Maybe<ChatMessagePF2e>): message is ChatMessagePF2e {
    if (!message) return false;

    const actor = message.actor;
    return !!actor && !actor.hasPlayerOwner;
}

const anonymousTool = new AnonymousTool();

type ToolSettings = {
    action: boolean;
    spell: boolean;
    traits: (typeof TRAITS_SETTING)[number];
};

export { anonymousTool };
export type { AnonymousTool };
