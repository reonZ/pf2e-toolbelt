import { querySelector, refreshLatestMessages } from "pf2e-api";
import { createTool } from "../tool";
import { CHATMESSAGE_GET_HTML } from "./shared/chatMessage";

const { config, settings, wrapper } = createTool({
    name: "hideDamage",
    settings: [
        {
            key: "enabled",
            type: Boolean,
            default: false,
            onChange: () => {
                refreshLatestMessages(20);
            },
        },
    ],
    wrappers: [
        {
            key: "messageGetHTML",
            path: CHATMESSAGE_GET_HTML,
            callback: chatMessageGetHTML,
        },
    ],
    init: () => {
        wrapper.toggle(settings.enabled);
    },
} as const);

async function chatMessageGetHTML(this: ChatMessagePF2e, html: HTMLElement) {
    if (!this.isContentVisible || !this.isDamageRoll) return;

    const actor = this.actor;
    if (!actor || actor.hasPlayerOwner) return;

    const isGM = game.user.isGM;
    const diceTotalElement = html.querySelector(".dice-result .dice-total");
    const totalElement = diceTotalElement?.querySelector<HTMLElement>(":scope > .total");
    const instancesElement = diceTotalElement?.querySelector<HTMLElement>(":scope > .instances");

    if (totalElement) {
        if (isGM) {
            totalElement.dataset.visibility = "gm";
        } else {
            totalElement.innerText = "???";
        }
    }

    if (instancesElement) {
        if (isGM) {
            instancesElement.dataset.visibility = "gm";
        } else {
            instancesElement.remove();
        }
    }
}

export { config as hideDamageTool };
