import {
    ChatMessagePF2e,
    createHTMLElement,
    createHTMLElementContent,
    firstElementWithText,
    htmlQuery,
    parseInlineParams,
    R,
    SAVE_TYPES,
    SaveType,
    splitListString,
} from "module-helpers";
import {
    getSaveLinkData,
    SaveLinkData,
    TargetsDataSource,
    TargetHelperTool,
    TargetsFlagData,
    TargetsData,
    getItem,
    addSetTargetsListener,
    addRollSavesListener,
    addSaveBtnListener,
    createTargetsRows,
} from "..";
import utils = foundry.utils;
import { canObserveActor } from "module-helpers/src";

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

    const canRollSaves = data.canRollNPCSaves;
    const isOwner = game.user.isGM || message.isAuthor;
    const canObserve = canObserveActor(message.actor);
    const item = canObserve ? await getItem(message, data) : null;

    const flavor = htmlQuery(html, ".message-header .flavor-text");
    const saveLabel = firstElementWithText(msgContent.lastElementChild);
    const label =
        firstElementWithText(flavor) ?? firstElementWithText(msgContent.firstElementChild);

    msgContent.innerHTML = await this.render("check-card", {
        item,
        isOwner,
        canRollSaves,
        speaker: message.speaker,
        label: label?.outerHTML || "",
        save: saveLabel?.outerHTML || "",
        traits: item?.traitChatData(),
    });

    msgContent.prepend(link);

    flavor?.remove();

    link.classList.add("hidden");

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

    const fakeBtn = htmlQuery<HTMLButtonElement>(msgContent, `[data-action="roll-fake-check"]`);

    if (fakeBtn) {
        addSaveBtnListener.call(this, link, fakeBtn, message, data);
    }

    if (!data.hasTargets) return;

    const rowsWrapper = createHTMLElement("div", {
        classes: ["pf2e-toolbelt-target-targetRows"],
    });

    for (const { row } of await createTargetsRows.call(this, message, data, false)) {
        rowsWrapper.append(row);
    }

    msgContent.append(rowsWrapper);
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
