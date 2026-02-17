import {
    canObserveActor,
    ChatMessagePF2e,
    createHTMLElementContent,
    firstElementWithText,
    htmlQuery,
    parseInlineParams,
    R,
    splitListString,
} from "foundry-helpers";
import { SAVE_TYPES } from "foundry-helpers/dist";
import { TRAITS_BLACKLIST } from "tools";
import {
    addRollSavesListener,
    addSaveBtnListener,
    addSetTargetsListener,
    addTargetsHeaders,
    getSaveLinkData,
    isDamageMessage,
    isMessageOwner,
    SaveLinkData,
    TargetHelperTool,
} from ".";
import { TargetHelper, TargetsData, TargetsDataSource } from "..";

const REPOST_CHECK_MESSAGE_REGEX = /^(?:<span data-visibility="\w+">.+?<\/span> ?)?(<a class="inline-check.+?<\/a>)$/;
const PROMPT_CHECK_MESSAGE_REGEX = /^(?:<p>)?@Check\[([^\]]+)\](?:{([^}]+)})?(?:<\/p>)?$/;

function prepareCheckMessage(
    this: TargetHelperTool,
    message: ChatMessagePF2e,
    updates: DeepPartial<TargetsDataSource>,
): boolean {
    const data = getCheckLinkData(message);
    if (!data) return false;

    foundry.utils.mergeObject(updates, data, { inplace: true });
    updates.type = "check";

    return true;
}

function getCheckLinkData(message: ChatMessagePF2e): SaveLinkData | null {
    const promptMatch = message.content.match(PROMPT_CHECK_MESSAGE_REGEX);
    if (promptMatch) {
        const [_match, paramString] = promptMatch;
        const rawParams = parseInlineParams(paramString, { first: "type" });
        if (!rawParams) return null;

        const statistic = rawParams.type?.trim();
        const dc = Number(rawParams.dc);
        if (!R.isIncludedIn(statistic, SAVE_TYPES) || isNaN(dc)) return null;

        const basic = "basic" in rawParams;
        const options = [...(basic ? ["damaging-effect"] : []), ...splitListString(rawParams.options ?? "")]
            .filter(R.isTruthy)
            .sort();

        return {
            author: message.actor?.uuid,
            saveVariants: { null: { dc, basic, statistic } },
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
            linkData.author = message.actor?.uuid;
        }

        return linkData;
    }

    return null;
}

async function renderCheckMessage(
    this: TargetHelperTool,
    message: ChatMessagePF2e,
    html: HTMLElement,
    data: TargetsData,
) {
    const msgContent = htmlQuery(html, ".message-content");
    const link = htmlQuery(msgContent, "a");
    if (!msgContent || !link) return;

    const targetHelper = new TargetHelper(data);
    if (!targetHelper.hasSave) return;

    const isOwner = isMessageOwner(message);
    const canRollSaves = targetHelper.canRollNPCSaves;
    const canObserve = canObserveActor(message.actor);
    const item = await targetHelper.getItem(message);

    const flavor = htmlQuery(html, ".message-header .flavor-text");
    const saveLabel = firstElementWithText(msgContent.lastElementChild);

    const label = firstElementWithText(flavor) ?? firstElementWithText(msgContent.firstElementChild);

    const traitsSetting = game.toolbelt?.getToolSetting("anonymous", "traits");
    const baseTraits = item?.traitChatData() ?? [];
    const traits = canObserve
        ? baseTraits
        : traitsSetting === "all"
          ? baseTraits
          : traitsSetting === "blacklist"
            ? baseTraits.filter((trait) => !R.isIncludedIn(trait.value, TRAITS_BLACKLIST))
            : [];

    msgContent.innerHTML = await this.render("check-card", {
        item: canObserve ? item : null,
        isOwner,
        canRollSaves,
        speaker: message.speaker,
        label: label?.outerHTML || "",
        save: saveLabel?.outerHTML || "",
        traits,
    });

    flavor?.remove();
    msgContent.prepend(link);
    link.classList.add("hidden");

    await addTargetsHeaders.call(this, message, targetHelper, msgContent);

    const fakeBtn = htmlQuery<HTMLButtonElement>(msgContent, `[data-action="roll-fake-check"]`);
    if (fakeBtn) {
        addSaveBtnListener.call(this, link, fakeBtn, message, targetHelper);
    }

    if (!isOwner) {
        html.classList.add("pf2e-toolbelt-check-player");
        return;
    }

    html.classList.add("pf2e-toolbelt-check-gm");

    const setTargetsBtn = htmlQuery(msgContent, `[data-action="set-targets"]`);
    if (setTargetsBtn) {
        addSetTargetsListener.call(this, setTargetsBtn, message, "targets");
    }

    if (canRollSaves) {
        const rollSavesBtn = htmlQuery(msgContent, `[data-action="roll-saves"]`);
        if (rollSavesBtn) {
            addRollSavesListener.call(this, rollSavesBtn, message, targetHelper);
        }
    }

    const mergeBtn = htmlQuery(msgContent, `[data-action="merge-to-damage"]`);
    mergeBtn?.addEventListener("click", () => {
        mergeToDamage.call(this, message, targetHelper);
    });
}

function mergeToDamage(this: TargetHelperTool, message: ChatMessagePF2e, targetHelper: TargetHelper) {
    const messages = game.messages.contents;
    const index = messages.findLastIndex((msg) => message === msg);
    const damageMessage = messages[index + 1];

    if (
        !damageMessage ||
        !isDamageMessage(damageMessage) ||
        !isMessageOwner(message) ||
        this.getFlag(damageMessage, "save")
    ) {
        return this.localize.warning("merge.none");
    }

    const source = R.pick(targetHelper.encode(), ["saveVariants", "targets"]);
    this.setFlag(damageMessage, source);

    // we clean up the check message as we are not gonna use it anymore
    this.unsetFlag(message);
}

export { prepareCheckMessage, renderCheckMessage };
