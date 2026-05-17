import {
    addListenerAll,
    arraysEqual,
    ChatMessagePF2e,
    createHTMLElement,
    htmlQuery,
    latestChatMessages,
    R,
    waitDialog,
} from "foundry-helpers";
import { getMessageMergeFlagData, injectDamage, mergeDamages, MergeOptions } from ".";
import { BetterChatTool } from "..";

const _cached: { injected?: string; icons: PartialRecord<ButtonType, string> } = { icons: {} };

const MERGE_MESSAGES = ["originMerge", "targetMerge"] as const;
const MERGE_TYPES = ["full", "half", "double"] as const;

const ICONS: Record<ButtonType, string> = {
    inject: "fa-solid fa-syringe",
    merge: "fa-duotone fa-merge",
    split: "fa-duotone fa-split",
};

async function renderChatMessageMergeDamage(this: BetterChatTool, message: ChatMessagePF2e, html: HTMLElement) {
    if (!isMessageOwner(message) || !message.isDamageRoll) return;

    const actor = message.actor;
    const targets = this.getMessageTargets(message);
    const injected = this.getFlag(message, "mergeDamage.injected");

    const buttons: ButtonType[] = [];

    if (injected || this.getFlag(message, "mergeDamage.merged")) {
        buttons.push("split");
    } else if (this.settings.inject) {
        buttons.push("inject");
    }

    if (this.settings.merge && actor) {
        buttons.push("merge");
    }

    if (!buttons.length) return;

    const buttonsElement = createHTMLElement("div", {
        classes: ["pf2e-toolbelt-merge-buttons"],
        content: buttons.map((type) => getButton.call(this, type)).join(""),
    });

    htmlQuery(html, ".dice-result .dice-total")?.append(buttonsElement);

    if (injected) {
        const action = htmlQuery(html, ".message-header .flavor-text .action");
        action?.insertAdjacentHTML("afterbegin", getInjectedIcon.call(this));
    }

    addListenerAll(buttonsElement, "[data-action]", async (el, event) => {
        event.stopPropagation();

        const action = el.dataset.action as EventAction;

        if (R.isIncludedIn(action, ["merge-damage", "inject-damage"] as const)) {
            for (const otherMessage of latestChatMessages(5, message)) {
                if (!otherMessage.isDamageRoll) continue;

                const isMerge = action === "merge-damage";
                if (isMerge && otherMessage.actor !== actor) continue;

                const otherTargets = this.getMessageTargets(otherMessage);
                if ((isMerge && arraysEqual(targets, otherTargets)) || !targets.length) {
                    const mergeOptions = event.shiftKey ? await mergeMenu.call(this, action) : {};
                    if (!mergeOptions) return;

                    if (isMerge) {
                        return mergeDamages.call(this, message, otherMessage, mergeOptions);
                    } else {
                        return injectDamage.call(this, message, otherMessage, mergeOptions);
                    }
                }
            }

            this.localize.warning("mergeDamage.noMatch");
        } else if (action === "split-damage") {
            const data = getMessageMergeFlagData.call(this, message);
            if (!data) return;

            const sources = data.flatMap((data) => {
                const source = data.source;

                source.sound = null;
                this.setFlagProperty(source, "splitted", true);

                return source;
            });

            if (sources?.length) {
                await message.delete();
                getDocumentClass("ChatMessage").createDocuments(sources);
            }
        }
    });
}

async function mergeMenu(
    this: BetterChatTool,
    action: "merge-damage" | "inject-damage",
): Promise<MergeOptions | false | null> {
    const isInject = action === "inject-damage";
    const split = R.map(MERGE_MESSAGES, (message) => {
        const header = `<h3>${this.localize("mergeDamage.menu", message)}</h3>`;

        const radios = R.map(MERGE_TYPES, (type) => {
            const label = this.localize("mergeDamage.menu", action, type);
            const checked = type === "full" ? "checked" : "";
            const disabled = isInject && message === "targetMerge" ? "disabled" : "";

            return `<label>
                <input type="radio" name="${message}" value="${type}" ${checked} ${disabled} />
                ${label}
            </label>`;
        });

        return `<div class="message">${header}${radios.join("")}</div>`;
    });

    return waitDialog<MergeOptions>({
        classes: ["pf2e-toolbelt-merge-damage-menu"],
        content: split.join(""),
        i18n: this.path("mergeDamage.menu", action),
        yes: {
            icon: isInject ? "fa-solid fa-syringe" : "fa-duotone fa-merge",
        },
    });
}

function getButton(this: BetterChatTool, type: ButtonType) {
    return (_cached.icons[type] ??= (() => {
        const icon = ICONS[type];
        const main = this.localize("mergeDamage.buttons", type);
        const tooltip = type === "split" ? main : main + "&#013;" + this.localize("mergeDamage.buttons.menu", type);

        return `<button data-action="${type}-damage" title="${tooltip}">
            <i class="${icon}"></i>
        </button>`;
    })());
}

function getInjectedIcon(this: BetterChatTool) {
    return (_cached.injected ??= (() => {
        const tooltip = this.localize("mergeDamage.injected");
        return `<i class="fa-solid fa-syringe" title="${tooltip}"></i> `;
    })());
}

function isMessageOwner(message: ChatMessagePF2e) {
    return game.user.isGM || message.isAuthor;
}

type EventAction = "merge-damage" | "split-damage" | "inject-damage";

type ButtonType = "merge" | "inject" | "split";

export { renderChatMessageMergeDamage };
