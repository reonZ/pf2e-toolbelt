import {
    ChatMessagePF2e,
    createHTMLElement,
    createHTMLElementContent,
    htmlQuery,
    registerUpstreamHook,
} from "foundry-helpers";
import { getSaveLinkData, isMessageOwner, TargetHelperTool } from ".";
import { TargetHelper, TargetsData, TargetsDataSource } from "..";
import { addTargetsHeaders } from ".";

const SAVE_LINK_REGEX = /<a class="inline-check.+?".+?data-pf2-check="(?:reflex|will|fortitude)".+?<\/a>/g;

function prepareActionMessage(
    this: TargetHelperTool,
    message: ChatMessagePF2e,
    updates: DeepPartial<TargetsDataSource>,
): boolean {
    updates.type = "action";

    const match = message.content.match(SAVE_LINK_REGEX);
    if (!match || match.length !== 1) return true;

    const link = createHTMLElementContent({ content: match[0] });
    const linkData = getSaveLinkData(link);

    if (linkData) {
        linkData.author ??= message.actor?.uuid;
        foundry.utils.mergeObject(updates, linkData, { inplace: true });
    }

    return true;
}

async function renderActionMessage(
    this: TargetHelperTool,
    message: ChatMessagePF2e,
    html: HTMLElement,
    data: TargetsData,
) {
    const msgContent = htmlQuery(html, ".message-content");
    if (!msgContent) return;

    const targetHelper = new TargetHelper(data);
    const hasSave = !!data.saveVariants.null;

    if (hasSave) {
        await addTargetsHeaders.call(this, message, targetHelper, msgContent, ["pf2e-toolbelt-target-actionRows"]);
    }

    if (!isMessageOwner(message)) return;

    html.addEventListener("drop", onChatMessageDrop.bind(this));

    if (!hasSave) return;

    const chatCard = htmlQuery(msgContent, ".chat-card");
    if (!chatCard) return;

    const footer = (() => {
        const exist = htmlQuery(chatCard, "footer");
        if (exist) return exist;

        const label = game.i18n.localize("TYPES.Item.action");
        const added = createHTMLElement("footer", { content: `<span>${label}</span>` });

        chatCard.append(added);
        return added;
    })();

    const buttonsWrapper = createHTMLElement("div", { classes: ["pf2e-toolbelt-target-buttons"] });
    const setTargetsBtn = createSetTargetsBtn.call(this, data);

    const rollSavesBtn = createRollNPCSavesBtn.call(this, message, data);
    if (rollSavesBtn) {
        buttonsWrapper.append(rollSavesBtn);
    }

    buttonsWrapper.append(setTargetsBtn);

    footer.append(buttonsWrapper);

    const damageLinks = msgContent.querySelectorAll<HTMLElement>(".inline-roll[data-formula][data-damage-roll]");

    for (const link of damageLinks) {
        link.addEventListener(
            "click",
            (event) => {
                // we cache the data & change its type
                const cached = data.encode({ type: "damage" });

                registerUpstreamHook(
                    "preCreateChatMessage",
                    (damageMessage: ChatMessagePF2e) => {
                        // we feed all the data to the damage message
                        this.updateSourceFlag(damageMessage, cached);
                    },
                    true,
                );

                // we clean the message save related data
                data.saveVariants = {};

                this.setMessageData(message, data);
            },
            true,
        );
    }
}

export { prepareActionMessage, renderActionMessage };
