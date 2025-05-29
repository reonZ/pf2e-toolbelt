import {
    ChatMessagePF2e,
    createHTMLElement,
    createHTMLElementContent,
    htmlQuery,
} from "module-helpers";
import {
    createRollNPCSavesBtn,
    createSetTargetsBtn,
    createTargetsRows,
    getSaveLinkData,
    onChatMessageDrop,
    TargetsDataSource,
    TargetHelperTool,
    TargetsData,
    TargetsFlagData,
    sendDataToDamageMessage,
} from "..";

const SAVE_LINK_REGEX =
    /<a class="inline-check.+?".+?data-pf2-check="(?:reflex|will|fortitude)".+?<\/a>/g;

function prepareActionMessage(
    this: TargetHelperTool,
    message: ChatMessagePF2e,
    updates: DeepPartial<TargetsDataSource>
): boolean {
    updates.type = "action";

    const match = message.content.match(SAVE_LINK_REGEX);
    if (!match || match.length !== 1) return true;

    const link = createHTMLElementContent({ content: match[0] });
    const linkData = getSaveLinkData(link);

    if (linkData) {
        linkData.save.author ??= message.actor?.uuid;
        foundry.utils.mergeObject(updates, linkData, { inplace: true });
    }

    return true;
}

async function renderActionMessage(
    this: TargetHelperTool,
    message: ChatMessagePF2e,
    html: HTMLElement,
    flag: TargetsFlagData
) {
    const msgContent = htmlQuery(html, ".message-content");
    if (!msgContent) return;

    const data = new TargetsData(flag);

    if (data.hasSave && data.hasTargets) {
        const rowsWrapper = createHTMLElement("div", {
            classes: ["pf2e-toolbelt-target-targetRows", "pf2e-toolbelt-target-actionRows"],
        });

        for (const { row } of await createTargetsRows.call(this, message, data, false)) {
            rowsWrapper.append(row);
        }

        msgContent.append(rowsWrapper);
    }

    const isGM = game.user.isGM;
    const isAuthor = message.isAuthor;
    if (!isGM && !isAuthor) return;

    html.addEventListener("drop", onChatMessageDrop.bind(this));

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

    if (!data.save?.basic) return;

    const damageLinks = msgContent.querySelectorAll<HTMLElement>(
        ".inline-roll[data-formula][data-damage-roll]"
    );

    for (const link of damageLinks) {
        link.addEventListener(
            "click",
            (event) => sendDataToDamageMessage.call(this, message, data),
            true
        );
    }
}

function isActionMessage(message: ChatMessagePF2e): boolean {
    const type = message.getFlag("pf2e", "origin.type") as string | undefined;
    return !!type && ["feat", "action"].includes(type);
}

export { isActionMessage, prepareActionMessage, renderActionMessage };
