import {
    ChatMessagePF2e,
    createHTMLElementContent,
    parseInlineParams,
    R,
    SAVE_TYPES,
    SaveType,
    splitListString,
} from "module-helpers";
import { getSaveLinkData, SaveLinkData, TargetsDataSource, TargetHelperTool } from "..";
import utils = foundry.utils;

const REPOST_CHECK_MESSAGE_REGEX =
    /^(?:<span data-visibility="\w+">.+?<\/span> ?)?(<a class="inline-check.+?<\/a>)$/;
const PROMPT_CHECK_MESSAGE_REGEX = /^(?:<p>)?@Check\[([^\]]+)\](?:{([^}]+)})?(?:<\/p>)?$/;

function prepareCheckMessage(
    this: TargetHelperTool,
    message: ChatMessagePF2e,
    updates: DeepPartial<TargetsDataSource>
): boolean {
    if (!this.upgradeChecks) return false;

    const data = getCheckLinkData(message);
    if (!data) return false;

    updates.type = "check";
    utils.mergeObject(updates, data, { inplace: true });

    return true;
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
        const link = createHTMLElementContent({ content: repostMatch[0] });
        const linkData = getSaveLinkData(link);

        if (linkData) {
            linkData.save.author = message.actor?.uuid;
        }

        return linkData;
    }

    return null;
}

export { prepareCheckMessage };
