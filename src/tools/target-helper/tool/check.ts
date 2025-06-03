import {
    ChatMessagePF2e,
    createHTMLElementContent,
    firstElementWithText,
    htmlQuery,
    parseInlineParams,
    R,
    SAVE_TYPES,
    SaveType,
    splitListString,
} from "module-helpers";
import { canObserveActor } from "module-helpers/src";
import {
    addRollSavesListener,
    addSaveBtnListener,
    addSetTargetsListener,
    addTargetsHeaders,
    getItem,
    getSaveLinkData,
    isDamageMessage,
    isMessageOwner,
    SaveLinkData,
    TargetHelperTool,
    TargetsData,
    TargetsDataSource,
    TargetsFlagData,
} from "..";
import utils = foundry.utils;

const REPOST_CHECK_MESSAGE_REGEX =
    /^(?:<span data-visibility="\w+">.+?<\/span> ?)?(<a class="inline-check.+?<\/a>)$/;
const PROMPT_CHECK_MESSAGE_REGEX = /^(?:<p>)?@Check\[([^\]]+)\](?:{([^}]+)})?(?:<\/p>)?$/;

function prepareCheckMessage(
    this: TargetHelperTool,
    message: ChatMessagePF2e,
    updates: DeepPartial<TargetsDataSource>
): boolean {
    const data = getCheckLinkData(message);
    if (!data) return false;

    utils.mergeObject(updates, data, { inplace: true });
    updates.type = "check";

    return true;
}

async function renderCheckMessage(
    this: TargetHelperTool,
    message: ChatMessagePF2e,
    html: HTMLElement,
    flag: TargetsFlagData
) {
    const msgContent = htmlQuery(html, ".message-content");
    const link = htmlQuery(msgContent, "a");
    if (!msgContent || !link) return;

    const data = new TargetsData(flag);
    if (!data.hasSave) return;

    const isOwner = isMessageOwner(message);
    const canRollSaves = data.canRollNPCSaves;
    const canObserve = canObserveActor(message.actor);
    const item = await getItem(message, data);

    const flavor = htmlQuery(html, ".message-header .flavor-text");
    const saveLabel = firstElementWithText(msgContent.lastElementChild);
    const label =
        firstElementWithText(flavor) ?? firstElementWithText(msgContent.firstElementChild);

    msgContent.innerHTML = await this.render("check-card", {
        item: canObserve ? item : null,
        isOwner,
        canRollSaves,
        speaker: message.speaker,
        label: label?.outerHTML || "",
        save: saveLabel?.outerHTML || "",
        traits: item?.traitChatData(),
    });

    flavor?.remove();
    msgContent.prepend(link);
    link.classList.add("hidden");

    await addTargetsHeaders.call(this, message, data, msgContent);

    const fakeBtn = htmlQuery<HTMLButtonElement>(msgContent, `[data-action="roll-fake-check"]`);
    if (fakeBtn) {
        addSaveBtnListener.call(this, link, fakeBtn, message, data);
    }

    if (!isOwner) return;

    html.classList.add("pf2e-toolbelt-check");

    const setTargetsBtn = htmlQuery(msgContent, `[data-action="set-targets"]`);
    if (setTargetsBtn) {
        addSetTargetsListener.call(this, setTargetsBtn, data, "targets");
    }

    if (canRollSaves) {
        const rollSavesBtn = htmlQuery(msgContent, `[data-action="roll-saves"]`);
        if (rollSavesBtn) {
            addRollSavesListener.call(this, rollSavesBtn, message, data);
        }
    }

    const mergeBtn = htmlQuery(msgContent, `[data-action="merge-to-damage"]`);
    mergeBtn?.addEventListener("click", () => {
        mergeToDamage.call(this, message, data);
    });
}

function mergeToDamage(this: TargetHelperTool, message: ChatMessagePF2e, data: TargetsData) {
    const messages = game.messages.contents;
    const index = messages.findLastIndex((msg) => message === msg);
    const damageMessage = messages[index + 1];

    if (
        !damageMessage ||
        !isDamageMessage(damageMessage) ||
        !isMessageOwner(message) ||
        this.getMessageSave(damageMessage)
    ) {
        return this.warning("merge.none");
    }

    const source = R.pick(data.toJSON(), ["save", "saves", "targets"]);
    this.setFlag(damageMessage, source);

    // we clean up the check message as we are not gonna use it anymore
    this.unsetFlag(message);
}

function getCheckLinkData(message: ChatMessagePF2e): SaveLinkData | null {
    const promptMatch = message.content.match(PROMPT_CHECK_MESSAGE_REGEX);
    if (promptMatch) {
        const [_match, paramString] = promptMatch;
        const rawParams = parseInlineParams(paramString, { first: "type" });
        if (!rawParams) return null;

        const statistic = rawParams.type?.trim() as SaveType;
        const dc = Number(rawParams.dc);
        if (!SAVE_TYPES.includes(statistic) || isNaN(dc)) return null;

        const basic = "basic" in rawParams;
        const options = [
            ...(basic ? ["damaging-effect"] : []),
            ...splitListString(rawParams.options ?? ""),
        ]
            .filter(R.isTruthy)
            .sort();

        return {
            save: { dc, basic, statistic, author: message.actor?.uuid },
            options,
            item: undefined,
            traits: splitListString(rawParams.traits ?? ""),
        } satisfies SaveLinkData;
    }

    const repostMatch = message.content.match(REPOST_CHECK_MESSAGE_REGEX);
    if (repostMatch) {
        const link = createHTMLElementContent({ content: repostMatch[1] });
        const linkData = getSaveLinkData(link);

        if (linkData) {
            linkData.save.author = message.actor?.uuid;
        }

        return linkData;
    }

    return null;
}

export { prepareCheckMessage, renderCheckMessage };
