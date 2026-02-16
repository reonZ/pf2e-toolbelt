import { ChatMessagePF2e, createHTMLElementContent, parseInlineParams, R, splitListString } from "foundry-helpers";
import { SAVE_TYPES } from "foundry-helpers/dist";
import { getSaveLinkData, SaveLinkData, TargetHelperTool } from ".";
import { TargetsDataSource } from "..";

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

export { prepareCheckMessage };
